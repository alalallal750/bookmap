"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PhysicalBook, PhysicalSearchResponse, ApiResponse } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { getNearbyDbnums, getDistrictName } from "@/lib/data/districtCoords";

const SEARCH_CACHE_KEY = "physical_search_state";
const RETURN_FROM_MAP_KEY = "physical_returning_from_map";

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
  | { status: "loading"; scope: "nearby" | "all" | "pending"; districtNames: string[]; progressGu?: string }
  | {
      status: "done";
      books: PhysicalBook[];
      query: string;
      scope: "nearby" | "all";
      districtNames: string[];
      /** [2026-07-10 추가] fetch 실패 구 — 지도 화면 정보나루 보강용으로 전달 */
      failedGus?: string[];
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

  // 지도 화면에서 뒤로가기로 돌아올 때만 검색 결과 복원.
  // 복원 조건: ?q= 없음 + "지도로 이동했다가 돌아옴" 플래그(RETURN_FROM_MAP_KEY) 존재.
  // 새로고침/직접 진입/전자책 경유 등은 플래그가 없으므로 idle로 시작.
  useEffect(() => {
    if (initialQuery) return;
    try {
      const fromMap = sessionStorage.getItem(RETURN_FROM_MAP_KEY);
      sessionStorage.removeItem(RETURN_FROM_MAP_KEY);
      if (!fromMap) return;
      const saved = sessionStorage.getItem(SEARCH_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Extract<SearchState, { status: "done" }>;
        setState(parsed);
      }
    } catch {}
  }, []);

  function goToEbookSearch() {
    // 종이책 → 전자책 이동: 검색어/결과 전달 안 함.
    // sessionStorage도 클리어 — 뒤로가기로 돌아왔을 때 이전 결과가 복원되지 않도록.
    try { sessionStorage.removeItem(SEARCH_CACHE_KEY); } catch {}
    router.push("/ebook");
  }

  async function handleSearch(query: string) {
    // 위치를 아직 못 가져온 단계 — "pending"으로 표시, 위치 확보/타임아웃
    // 후 바로 진짜 scope로 갈아끼움(아래에서 setState로 갱신).
    setState({ status: "loading", scope: "pending", districtNames: [] });
    try { sessionStorage.removeItem(SEARCH_CACHE_KEY); } catch {}
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

        // GPS 확보 즉시 검색 대상 구 이름을 로컬에서 계산해 로딩 문구에 반영.
        // API 응답 전이지만 getNearbyDbnums는 순수 로컬 계산이므로 바로 가능.
        const nearbyNames = getNearbyDbnums(coords.latitude, coords.longitude)
          .map((d) => getDistrictName(d))
          .filter((n): n is string => Boolean(n));
        setState({ status: "loading", scope: "nearby", districtNames: nearbyNames });
      } catch {
        // 위치 못 가져와도 검색은 진행 — scope: "all"로 처리됨
      }

      if (!hasLocation) {
        setState({ status: "loading", scope: "all", districtNames: [] });
      }

      const res = await fetch(url.toString());
      if (!res.body) throw new Error("스트림 없음");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let finalData: PhysicalSearchResponse | null = null;
      let errorMsg: string | null = null;
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const data = JSON.parse(line);
          if (data.type === "progress" && !hasLocation) {
            setState((prev) =>
              prev.status === "loading" ? { ...prev, progressGu: data.gu } : prev
            );
          } else if (data.type === "done") {
            if (data.success) finalData = data.data;
            else errorMsg = data.error ?? "검색 중 오류가 발생했습니다.";
          }
        }
      }

      if (errorMsg) throw new Error(errorMsg);
      if (!finalData) throw new Error("응답 없음");

      const sortedBooks = [...finalData.books].sort((a, b) => {
        const diff = b.libraries.length - a.libraries.length;
        if (diff !== 0) return diff;
        const aAvail = a.libraries.filter((l) => l.available).length;
        const bAvail = b.libraries.filter((l) => l.available).length;
        return bAvail - aAvail;
      });

      const nextState: Extract<SearchState, { status: "done" }> = {
        status: "done",
        books: sortedBooks,
        query,
        scope: finalData.meta.scope,
        districtNames: finalData.meta.districtNames,
        failedGus: finalData.meta.failedGus,
      };
      setState(nextState);
      try {
        sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(nextState));
      } catch {}
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: PhysicalBook, scope: "nearby" | "all") {
    try {
      // failedGus: 지도 화면이 캐시 진입 시 정보나루로 보강할 실패 구 목록
      const failedGus = state.status === "done" ? state.failedGus : undefined;
      sessionStorage.setItem(`physical_book_${book.isbn}`, JSON.stringify({ book, scope, failedGus }));
      sessionStorage.setItem(RETURN_FROM_MAP_KEY, "1");
    } catch (e) {
      console.log("[physical/page] sessionStorage 저장 실패:", e);
    }
    router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <img src="/logo-header.png" alt="지금빌려" style={{ height: "40px", width: "107px" }} />
            <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              종이책
            </span>
          </div>
          <p className="text-xs text-gray-400">
            그 책, 지금 어디서 빌릴 수 있지?
            <br />
            나랑 가까운 <span className="text-[#1d2b6b] font-bold" style={{ textShadow: "0 1px 1px rgba(29,43,107,0.18)" }}>서울시 도서관</span>에서 찾아볼게요. ISBN이 없는 경우 검색되지 않아요.
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
              <p className="text-gray-400 text-sm">
                {state.progressGu ? `${state.progressGu}에서 찾는 중...` : "서울시 모든 구에서 검색 중..."}
              </p>
            ) : state.scope === "nearby" && state.districtNames.length > 0 ? (
              <p className="text-gray-400 text-sm">
                지금 {state.districtNames.join(", ")}에서 검색 중...
              </p>
            ) : (
              <p className="text-gray-400 text-sm">현재 위치 확인 중...</p>
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