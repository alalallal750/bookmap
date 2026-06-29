"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PhysicalBook, PhysicalSearchResponse, ApiResponse } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";

/**
 * [2026-06-24 변경 — 위치 유무에 따른 검색 범위 분기 + 로딩 문구]
 * /api/physical-search 응답 형태가 PhysicalBook[] → { books, meta }로
 * 바뀜에 따라 화면도 같이 변경. meta.scope로 로딩 중 문구를 다르게
 * 보여줌 — "nearby"면 실제 검색 중인 구 이름을, "all"이면 위치가 없어
 * 서울 전체를 검색 중임을 안내. scope/districtNames는 책 선택 시
 * sessionStorage에 같이 저장해 지도 화면에 전달 — 지도 화면이 "all"
 * 일 때는 이미 전체를 다 검색한 상태이므로 "이 지역에서 재검색" 버튼을
 * 숨기는 데 사용.
 */
type SearchState =
  | { status: "idle" }
  | { status: "loading"; scope: "nearby" | "all" | "pending"; districtNames: string[] }
  | {
      status: "done";
      books: PhysicalBook[];
      query: string;
      scope: "nearby" | "all";
      districtNames: string[];
    }
  | { status: "error"; message: string };

export default function PhysicalSearchPage() {
  return (
    <Suspense>
      <PhysicalSearchInner />
    </Suspense>
  );
}

function PhysicalSearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [state, setState] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToEbookSearch() {
    const q = state.status === "done" ? state.query : "";
    router.push(q ? `/ebook?q=${encodeURIComponent(q)}` : "/ebook");
  }

  async function handleSearch(query: string) {
    // 위치를 아직 못 가져온 단계 — "pending"으로 표시, 위치 확보/타임아웃
    // 후 바로 진짜 scope로 갈아끼움(아래에서 setState로 갱신).
    setState({ status: "loading", scope: "pending", districtNames: [] });
    try {
      const url = new URL("/api/physical-search", window.location.origin);
      url.searchParams.set("q", query);

      let hasLocation = false;
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
        hasLocation = true;
      } catch {
        // 위치 못 가져와도 검색은 진행 — scope: "all"로 처리됨
      }

      // 위치 확보 시도가 끝난 시점(최대 3초) — 아직 응답은 안 왔지만,
      // 이 시점부터는 scope를 짐작할 수 있으므로 로딩 문구를 더 정확하게
      // 보여줄 수 있음. 다만 정확한 districtNames는 API 응답(meta)에만
      // 있으므로, 여기서는 "전체 검색"인 경우만 먼저 문구를 확정하고,
      // "위치 기반"인 경우는 응답이 올 때까지 "확인 중" 문구를 유지.
      if (!hasLocation) {
        setState({ status: "loading", scope: "all", districtNames: [] });
      }

      const res = await fetch(url.toString());
      const json: ApiResponse<PhysicalSearchResponse> = await res.json();
      if (!json.success) throw new Error(json.error);

      const sortedBooks = [...json.data.books].sort((a, b) => {
        const diff = b.libraries.length - a.libraries.length;
        if (diff !== 0) return diff;
        const aAvail = a.libraries.filter((l) => l.available).length;
        const bAvail = b.libraries.filter((l) => l.available).length;
        return bAvail - aAvail;
      });

      setState({
        status: "done",
        books: sortedBooks,
        query,
        scope: json.data.meta.scope,
        districtNames: json.data.meta.districtNames,
      });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: PhysicalBook, scope: "nearby" | "all") {
    try {
      sessionStorage.setItem(
        `physical_book_${book.isbn}`,
        JSON.stringify({ book, scope })
      );
    } catch (e) {
      console.log("[physical/page] sessionStorage 저장 실패:", e);
    }
    router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex flex-col items-start gap-1 flex-shrink-0">
            <img src="/logo-header.png" alt="지금빌려" style={{ height: "40px", width: "107px" }} />
            <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              종이책
            </span>
          </div>
          <p className="text-xs text-gray-400">
            그 책, 지금 어디서 빌릴 수 있지?
            <br />
            나랑 가까운 서울시 도서관에서 찾아볼게요. ISBN이 없는 경우 검색되지 않아요.
          </p>
        </div>
        <SearchBar onSearch={handleSearch} loading={state.status === "loading"} defaultValue={initialQuery} />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <>
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
            <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-100">
              <button
                onClick={goToEbookSearch}
                className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-800"
              >
                전자책으로 찾아보시겠어요?
              </button>
            </div>
          </>
        )}

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            {state.scope === "all" ? (
              <p className="text-gray-400 text-sm">서울시 모든 구에서 검색 중...</p>
            ) : (
              <p className="text-gray-400 text-sm">지금 근처에서 빌릴 수 있는 책 찾는 중...</p>
            )}
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
                        onClick={() => handleSelectBook(book, state.scope)}
                        className="w-full flex items-start gap-3 text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                      >
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

            {/* 전자책으로 찾아보시겠어요 버튼 */}
            <div className="mt-6 mb-2">
              <button
                onClick={goToEbookSearch}
                className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-800"
              >
                전자책으로 찾아보시겠어요?
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}