"use client";

/**
 * [2026-07-18 신규 — 전국판] 전국 종이책 검색 화면 (인수인계 17~18장).
 * [2026-07-20] 라우트 /physical/all → /nationwide 이전. 서울전용(기존
 * /physical)과 별도 운영 — 서울 지도로 넘길 때 from=nationwide를 붙여
 * 뒤로가기가 전국판 검색으로 돌아오게 한다.
 *
 * 기존 /physical(서울)과 별개 신규 페이지 — 기존 파이프라인 무수정 원칙.
 * 흐름:
 *   1. 제목 검색 → 카카오 책 후보(판본) 목록 → 사용자가 판본 선택
 *      (전국 검색은 ISBN 완전일치 단일 판본 — 판본 확장은 3순위 로드맵)
 *      제목 0건이면 저자 검색으로 자동 재시도 (kakaoBook.ts 폴백).
 *   2. 위치 있으면: 가까운 시군구 기준 시도 전체 자동 검색 후 바로 지도.
 *      가장 가까운 곳이 서울이면 기존 서울 지도(/physical/map)로 —
 *      서울은 스크래핑 실권수·실시간 데이터가 더 좋다.
 *   3. 위치 없으면: [07-18 2차 피드백] SVG 시도 지도를 "팝업"으로 띄워
 *      선택 → 선택 즉시 팝업이 닫히며 지도 페이지로 이동 (별도 페이지
 *      단계 없음). 광역시·세종은 시도 탭 즉시, 도는 팝업 안에서 시군구
 *      2단계. 검색은 어차피 시도 전체 1~2회 호출 — 시군구는 지도 시작
 *      위치일 뿐.
 *   4. 추천 칩 경유는 판본 선택 생략(ISBN 기지) — 위치 있으면 바로 지도,
 *      없으면 지역 팝업 (사용자 확정 동선).
 */

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiResponse, KakaoBookCandidate } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { KoreaRegionMap } from "@/components/search/KoreaRegionMap";
import { SuggestionChip } from "@/components/search/SuggestionChip";
import { GuidePopup } from "@/components/search/GuidePopup";
import { suggestions } from "@/lib/data/suggestions";
import {
  SearchUnit,
  getNearbyUnits,
  getUnitsByRegion,
} from "@/lib/data/searchUnits";

// 지도에서 뒤로 돌아왔을 때만 검색 상태를 복원 (서울판과 동일 패턴 —
// 새로고침·직접 진입은 idle로 시작)
const SEARCH_CACHE_KEY = "nationwide_search_state";
const RETURN_FROM_MAP_KEY = "nationwide_returning_from_map";

type PageState =
  | { step: "idle" }
  | { step: "loadingCandidates"; query: string }
  | { step: "candidates"; query: string; candidates: KakaoBookCandidate[] }
  | { step: "error"; message: string };

/** 지역 선택 팝업 상태 — book이 있으면 열림 (시군구 단계 없음 — 3차 피드백) */
type PickerState = { book: KakaoBookCandidate } | null;

export default function NationwidePhysicalPage() {
  return (
    <Suspense>
      <NationwideInner />
    </Suspense>
  );
}

function NationwideInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [state, setState] = useState<PageState>({ step: "idle" });
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [picker, setPicker] = useState<PickerState>(null);
  const [locating, setLocating] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // 지도에서 뒤로가기로 돌아온 경우에만 후보 목록 복원
  useEffect(() => {
    if (initialQuery) return;
    try {
      const fromMap = sessionStorage.getItem(RETURN_FROM_MAP_KEY);
      sessionStorage.removeItem(RETURN_FROM_MAP_KEY);
      if (!fromMap) return;
      const saved = sessionStorage.getItem(SEARCH_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Extract<PageState, { step: "candidates" }>;
        setState(parsed);
        setSearchValue(parsed.query);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(query: string) {
    setPicker(null);
    setState({ step: "loadingCandidates", query });
    try { sessionStorage.removeItem(SEARCH_CACHE_KEY); } catch {}
    try {
      const res = await fetch(`/api/book-candidates?q=${encodeURIComponent(query)}`);
      const json: ApiResponse<KakaoBookCandidate[]> = await res.json();
      if (!json.success) throw new Error(json.error);
      if (json.data.length === 0) {
        setState({ step: "error", message: "책을 찾지 못했어요. 다른 제목으로 검색해보세요." });
        return;
      }
      const next = { step: "candidates" as const, query, candidates: json.data };
      setState(next);
      try { sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(next)); } catch {}
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.",
      });
    }
  }

  function goToMap(book: KakaoBookCandidate, units: SearchUnit[], wide = false) {
    const codes = units.map((u) => u.code).join(",");
    const author = book.authors.join(", ");
    router.push(
      `/nationwide/map/${book.isbn}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(author)}&units=${codes}${wide ? "&wide=1" : ""}`
    );
  }

  /**
   * 판본 확정 후 진입점 — 위치를 시도하고, 성공하면 바로 지도로(현재
   * 화면 위에 스피너만), 실패하면 지역 선택 팝업을 띄운다.
   */
  async function handlePickBook(book: KakaoBookCandidate) {
    setLocating(true);
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
      const nearby = getNearbyUnits(coords.latitude, coords.longitude, 3);
      if (nearby.length === 0) {
        setPicker({ book });
        return;
      }
      // 가장 가까운 시군구가 서울이면 기존 서울 파이프라인(스크래핑
      // 실권수·실시간)으로 — 지도 화면이 ISBN+위치로 자체 검색한다.
      // from=nationwide: 서울 지도의 뒤로가기가 전국판 검색으로 돌아오게.
      if (nearby[0].region === "11") {
        router.push(
          `/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}&from=nationwide`
        );
        return;
      }
      goToMap(book, nearby);
    } catch {
      setPicker({ book }); // 위치 없음 — 지역 선택 팝업
    } finally {
      setLocating(false);
    }
  }

  /**
   * [07-18] 추천 칩 경유 검색 — 추천 도서는 ISBN을 이미 알므로 판본 선택을
   * 건너뛰고 바로 위치 판정으로(사용자 결정: 위치 있으면 바로 지도, 없으면
   * 지역 팝업). 뒤로가기 복원을 위해 단일 후보 상태를 캐시에 저장해 둠.
   */
  function handlePickSuggestion(title: string) {
    const s = suggestions.find((x) => x.title === title);
    if (!s) {
      // 추천 목록에 없으면(방어) 일반 검색 흐름
      setSearchValue(title);
      handleSearch(title);
      return;
    }
    const book: KakaoBookCandidate = {
      isbn: s.isbn13,
      title: s.title,
      authors: [s.author],
      publisher: s.publisher,
      thumbnail: s.coverUrl,
    };
    try {
      sessionStorage.setItem(
        SEARCH_CACHE_KEY,
        JSON.stringify({ step: "candidates", query: s.title, candidates: [book] })
      );
    } catch {}
    handlePickBook(book);
  }

  /**
   * 팝업에서 시도 선택 — [07-18 3차 피드백] 시군구 단계 없이 탭 즉시
   * 지도로. wide=1이라 지도 화면이 그 시도 소장관 전체가 보이게 범위를
   * 자동으로 맞춘다 (검색은 어느 쪽이든 시도 1~2회 호출로 동일).
   */
  function handlePickRegion(book: KakaoBookCandidate, region: string) {
    if (region === "11") {
      // 서울은 기존 파이프라인 — 위치 없는 검색도 기존 화면이 전체 구를 처리
      router.push(
        `/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}&from=nationwide`
      );
      return;
    }
    const units = getUnitsByRegion(region).filter((u) => u.libCount > 0);
    if (units.length === 0) return;
    // units 파라미터는 메타·중심 폴백용 대표 1곳(참여관 최다 시군구)만 전달
    const start = [...units].sort((a, b) => b.libCount - a.libCount)[0];
    goToMap(book, [start], true);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <a href="/nationwide">
              <img src="/logo-header.png" alt="지금빌려" style={{ height: "40px", width: "107px" }} />
            </a>
            <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              종이책 · 전국
            </span>
          </div>
          {/* [07-20] 책이음 바코드 문구는 헤더가 길어져 삭제 — 아래 idle
              본문의 책이음 발급 안내로 갈음 */}
          <p className="text-xs leading-relaxed text-gray-400 flex-1 min-w-0">
            그 책, 지금 어디서 빌릴 수 있지?
            <br />
            원하는 위치의 도서관에서 바로 찾아볼게요.
          </p>
          <button
            onClick={() => setGuideOpen(true)}
            className="flex-shrink-0 p-1 -mr-1 text-gray-400 active:text-gray-600"
            aria-label="이용 안내"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 9v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="10" cy="6.3" r="1" fill="currentColor" />
            </svg>
          </button>
        </div>
        <SearchBar
          onSearch={handleSearch}
          loading={state.step === "loadingCandidates"}
          value={searchValue}
          onChange={setSearchValue}
          theme="green"
          placeholder="그 책, 뭐였더라?"
        />
        <SuggestionChip
          visible={state.step === "idle" && searchValue.trim() === ""}
          onPick={handlePickSuggestion}
          theme="green"
        />
      </header>

      <div className="flex-1 py-4">
        {state.step === "idle" && (
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
              전국 공공도서관에서 소장 여부를 확인해 드려요.
            </p>
            <div className="mt-10" />
            <p className="text-gray-400 text-xs leading-relaxed">
              <a
                href="https://books.nl.go.kr/tech/contents/TE4010300000.do?schM=view&id=57806"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 font-medium"
              >
                카카오
              </a>
              /
              <a
                href="https://books.nl.go.kr/tech/contents/TE4010300000.do?schOpt5=PUNOTICE&schOpt6=U&schM=view&act=UPDATE&page=2&ordFld=regdt&ordBy=DESC&viewCount=10&id=48545&schBdcode=&schGroupCode="
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 font-medium"
              >
                네이버
              </a>{" "}
              등에서 책이음 회원 카드를 발급받으시면,
              <br />
              전국 공공도서관에서 책을 빌릴 수 있어요.
            </p>
            <p className="mt-4 text-gray-300 text-xs leading-relaxed">
              대출가능여부는 도서관 홈페이지에서 다시 확인해 주세요.
            </p>
            <p className="mt-6 text-[10px] text-gray-400">
              도서관 소장 데이터 출처 :{" "}
              <a
                href="https://www.data4library.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                정보나루
              </a>
            </p>
          </div>
        )}

        {state.step === "loadingCandidates" && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">책을 찾는 중...</p>
          </div>
        )}

        {state.step === "candidates" && (
          <div className="px-4">
            <p className="text-xs text-gray-400 mb-2">
              찾는 책(판본)을 선택하세요 — ISBN이 같은 판본만 검색돼요.
            </p>
            <ul className="space-y-2">
              {state.candidates.map((c) => (
                <li key={c.isbn}>
                  <button
                    onClick={() => handlePickBook(c)}
                    className="w-full flex items-start gap-3 text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                  >
                    <div className="flex-shrink-0 w-12 h-16 bg-gray-100 rounded-lg overflow-hidden">
                      {c.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnail} alt={`${c.title} 표지`} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm line-clamp-2">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.authors.join(", ")}
                        {c.publisher ? ` · ${c.publisher}` : ""}
                        {c.publishedDate ? ` · ${c.publishedDate.slice(0, 4)}년` : ""}
                      </p>
                      <p className="text-xs text-gray-300 mt-1">ISBN {c.isbn}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.step === "error" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}
      </div>

      {/* 위치 확인 중 오버레이 — 화면 전환 없이 스피너만 */}
      {locating && (
        <div className="fixed inset-0 z-40 bg-black/10 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-5 shadow-lg flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-gray-500 text-sm">현재 위치 확인 중...</p>
          </div>
        </div>
      )}

      {/* [07-18 2차 피드백] 지역 선택 팝업 — 선택 즉시 닫히며 지도로 이동 */}
      {picker && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPicker(null)} />
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-gray-800">어느 지역에서 찾을까요?</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  「{picker.book.title}」 — 지역을 누르면 그 지역 전체에서 찾아드려요
                </p>
              </div>
              <button
                onClick={() => setPicker(null)}
                className="p-1.5 text-gray-400 active:text-gray-600"
                aria-label="닫기"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <KoreaRegionMap
              onSelect={(region) => handlePickRegion(picker.book, region)}
            />
          </div>
        </div>
      )}

      {/* ⓘ 이용 안내 팝업 — 헤더 우측 버튼 탭 시에만 열림 */}
      {guideOpen && <GuidePopup onClose={() => setGuideOpen(false)} />}
    </main>
  );
}
