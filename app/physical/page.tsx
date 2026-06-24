"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhysicalBook, KakaoBookCandidate, ApiResponse } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";

/**
 * [2026-06-24 변경 — ISBN 후보 선택 흐름 추가]
 * 기존: 제목 검색 → 서울도서관 응답의 ISBN으로 자동 그룹화 → 카드 목록
 * 변경: 제목 검색 → 카카오 ISBN 후보 조회 → "candidates" 단계로 사용자
 *       선택 → 선택한 ISBN으로 서울도서관 ISBN 검색 → 카드(도서관 목록)
 *
 * 이유: 서울도서관 응답은 구마다 ISBN 필드 제공 여부가 달라(이슈 D —
 * 송파구·성북구는 제목 검색 시 ISBN을 안 줌), 자동 그룹화에 의존하면
 * 일부 구가 검색에서 통째로 빠지는 문제가 있었음. ISBN을 카카오에서
 * 먼저 확정하면 이 문제가 사라짐(2026-06-24 실측 확인).
 *
 * "candidates" 단계는 후보가 1건이어도 항상 보여줌 — 사용자가 "이 책이
 * 맞는지" 확인하는 절차를 생략하지 않기로 결정함.
 *
 * 카카오 후보가 0건이면(서울도서관에는 있지만 카카오 책 DB에 없는 책일
 * 가능성), 기존 방식(제목으로 직접 서울도서관 검색)으로 자동 fallback —
 * 사용자에게 별도 안내 없이 매끄럽게 진행됨.
 */
type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "candidates"; candidates: KakaoBookCandidate[]; query: string }
  | { status: "done"; books: PhysicalBook[]; query: string }
  | { status: "error"; message: string };

/** 위치 권한을 받아 URL에 lat/lng를 채워주는 공용 헬퍼.
 * 위치를 못 가져와도 에러를 던지지 않음 — 검색 자체는 DEFAULT_LOCATION
 * 으로 계속 진행되어야 하므로(기존 동작과 동일).
 */
async function appendLocationParams(url: URL): Promise<void> {
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
}

export default function PhysicalSearchPage() {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });

  /** 1단계: 제목 검색 → 카카오 ISBN 후보 조회 */
  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const url = new URL("/api/book-candidates", window.location.origin);
      url.searchParams.set("q", query);

      const res = await fetch(url.toString());
      const json: ApiResponse<KakaoBookCandidate[]> = await res.json();
      if (!json.success) throw new Error(json.error);

      if (json.data.length === 0) {
        // 카카오에 후보가 전혀 없으면 기존 방식(제목 직접 검색)으로 진행
        console.log("[physical/page] 카카오 후보 0건 — 제목 검색으로 fallback:", query);
        await searchByTitleDirectly(query);
        return;
      }

      setState({ status: "candidates", candidates: json.data, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  /** 카카오 0건일 때 fallback — 기존 /api/physical-search(제목 기반) 그대로 사용 */
  async function searchByTitleDirectly(query: string) {
    try {
      const url = new URL("/api/physical-search", window.location.origin);
      url.searchParams.set("q", query);
      await appendLocationParams(url);

      const res = await fetch(url.toString());
      const json: ApiResponse<PhysicalBook[]> = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ status: "done", books: json.data, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  /** 2단계: 사용자가 후보 하나 선택 → 그 ISBN으로 25개 구 검색 */
  async function handleSelectCandidate(candidate: KakaoBookCandidate) {
    setState({ status: "loading" });
    try {
      const url = new URL("/api/physical-search-by-isbn", window.location.origin);
      url.searchParams.set("isbn", candidate.isbn);
      url.searchParams.set("title", candidate.title);
      await appendLocationParams(url);

      const res = await fetch(url.toString());
      const json: ApiResponse<PhysicalBook[]> = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ status: "done", books: json.data, query: candidate.title });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: PhysicalBook) {
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

        {state.status === "candidates" && (
          <div className="px-4">
            <p className="text-xs text-gray-400 mb-3 px-1">
              찾는 책이 맞는지 확인해 주세요
            </p>
            <ul className="space-y-2">
              {state.candidates.map((candidate) => (
                <li key={candidate.isbn}>
                  <button
                    onClick={() => handleSelectCandidate(candidate)}
                    className="w-full flex items-start gap-3 text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                  >
                    <div className="flex-shrink-0 w-12 h-16 bg-gray-100 rounded-lg overflow-hidden">
                      {candidate.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.thumbnail}
                          alt={`${candidate.title} 표지`}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm line-clamp-2">
                        {candidate.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {candidate.authors.join(", ")}
                        {candidate.publisher ? ` · ${candidate.publisher}` : ""}
                      </p>
                      {candidate.publishedDate ? (
                        <p className="text-xs text-gray-300 mt-0.5">
                          {candidate.publishedDate.slice(0, 4)}년
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
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
                        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                      >
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