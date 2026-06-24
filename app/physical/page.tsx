"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhysicalBook, ApiResponse } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";

/**
 * [2026-06-24 변경 — 카카오 책 검색 API 제거, ISBN 후보 선택 단계 제거]
 * 카카오 책 검색으로 ISBN 후보를 먼저 보여주는 방식은, 도서관에 없는
 * 책(큰글자도서판, 외국어판, 가이드북 등)까지 후보로 섞여 나와 노이즈가
 * 심하다는 문제가 확인됨(2026-06-24). 서울도서관이 실제로 찾아준 책만
 * 후보로 보여주는 기존 방식(제목 검색)으로 되돌림 — 도서관에 없는 책은
 * 처음부터 후보에 안 나타나므로 노이즈 문제가 원천적으로 해결됨.
 *
 * [데이터 재사용] 검색 단계에서 이미 도서관별 대출가능 여부까지 다
 * 받아온 상태이므로, 사용자가 책을 선택하면 그 데이터를 sessionStorage에
 * 저장해서 지도 화면으로 그대로 넘김 — 지도 화면이 같은 검색을 또 하지
 * 않도록 해서, 서울도서관 서버에 가는 중복 요청을 없앰.
 */
type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; books: PhysicalBook[]; query: string }
  | { status: "error"; message: string };

export default function PhysicalSearchPage() {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const url = new URL("/api/physical-search", window.location.origin);
      url.searchParams.set("q", query);

      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("위치 미지원"));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
          );
        });
        url.searchParams.set("lat", String(coords.latitude));
        url.searchParams.set("lng", String(coords.longitude));
      } catch {
        // 위치 못 가져와도 검색은 진행 (DEFAULT_LOCATION으로 처리됨)
      }

      const res = await fetch(url.toString());
      const json: ApiResponse<PhysicalBook[]> = await res.json();
      if (!json.success) throw new Error(json.error);

      // [2026-06-24 추가] 소장 도서관 수 많은 순으로 정렬 — 동률이면
      // 대출가능한 곳 많은 순. 정렬 기준이 없으면 25개 구 응답이 도착한
      // 순서(네트워크 상황에 따라 매번 달라짐)대로 나열되어, 가이드북·
      // 외국어판처럼 소장이 적은 책이 우연히 위쪽에 뜨는 노이즈 문제가
      // 있었음. 소장이 많은 책일수록 표준판일 가능성이 높다는 판단으로
      // 이 기준을 채택.
      const sortedBooks = [...json.data].sort((a, b) => {
        const diff = b.libraries.length - a.libraries.length;
        if (diff !== 0) return diff;
        const aAvail = a.libraries.filter((l) => l.available).length;
        const bAvail = b.libraries.filter((l) => l.available).length;
        return bAvail - aAvail;
      });

      setState({ status: "done", books: sortedBooks, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: PhysicalBook) {
    try {
      sessionStorage.setItem(`physical_book_${book.isbn}`, JSON.stringify(book));
    } catch (e) {
      console.log("[physical/page] sessionStorage 저장 실패:", e);
    }
    router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <img src="/logo-header.png" alt="지금빌려" className="h-10" />
          <p className="text-xs text-gray-400">그 책, 지금 어디서 빌릴 수 있지?</p>
        </div>
        <SearchBar onSearch={handleSearch} loading={state.status === "loading"} />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <img
              src="/logo-main.png"
              alt="지금빌려 로고"
              className="w-64 mb-6"
              style={{ filter: "brightness(0.9)" }}
            />
            <p className="text-gray-500 text-base font-medium mb-1">
              읽고 싶은 책을 검색하세요
            </p>
            <p className="text-gray-400 text-sm mb-4">
              나랑 가까운 도서관에서 지금 빌릴 수 있는지 바로 확인해 드려요.
            </p>
            <div className="mt-10" />
            <p className="text-gray-300 text-xs leading-relaxed">
              서울시 전체 도서관 정보를 보여드려요.
              <br />
              실제 대출가능 여부는 도서관 홈페이지에서 다시 한번 확인해 주세요.
            </p>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">검색 중...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}

        {state.status === "done" && (
          <div className="px-4">
            {state.books.length === 0 ? (
              <p className="text-gray-400 text-sm text-center pt-16">
                검색 결과가 없어요. 다른 제목으로 검색해보세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.books.map((book) => {
                  const availableCount = book.libraries.filter((l) => l.available).length;
                  return (
                    <li key={book.isbn}>
                      <button
                        onClick={() => handleSelectBook(book)}
                        className="w-full flex items-start gap-3 text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                      >
                        {/* [2026-06-24 추가] 표지 이미지 — 서울도서관 응답의
                            Image 필드(book.coverImage)를 그대로 사용.
                            기존 화면엔 이 부분 자체가 빠져 있었음(v11
                            이슈 A와 동일한 패턴). 이미지가 없으면 빈
                            칸 대신 책 아이콘으로 대체. */}
                        <div className="flex-shrink-0 w-12 h-16 bg-gray-100 rounded-lg overflow-hidden">
                          {book.coverImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={book.coverImage}
                              alt={`${book.title} 표지`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                                <rect x="3" y="2" width="18" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M7 7h10M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm line-clamp-1">
                            {book.title}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {book.author}
                            {book.publisher ? ` · ${book.publisher}` : ""}
                            {book.publishYear ? ` · ${book.publishYear}` : ""}
                          </p>
                          <p
                            className={`text-xs mt-1.5 font-semibold ${
                              availableCount > 0 ? "text-green-600" : "text-gray-400"
                            }`}
                          >
                            {book.libraries.length}개 도서관 소장
                            {availableCount > 0 ? ` · ${availableCount}곳 대출가능` : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}