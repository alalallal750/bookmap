"use client";

/**
 * [2026-07-18 신규 — 전국판] 전국 종이책 검색 화면 (인수인계 17장 설계).
 *
 * 기존 /physical(서울)과 별개 신규 페이지 — 기존 파이프라인 무수정 원칙.
 * 흐름:
 *   1. 제목 검색 → 카카오 책 후보(판본) 목록 → 사용자가 판본 선택
 *      (전국 검색은 ISBN 완전일치 단일 판본 — 판본 확장은 3순위 로드맵)
 *   2. 위치 있으면: 가까운 시군구 3곳(현재+인접) 자동 검색.
 *      가장 가까운 곳이 서울이면 기존 서울 지도(/physical/map)로 보냄
 *      — 서울은 스크래핑 실권수·실시간 데이터가 더 좋다.
 *   3. 위치 없으면: 시도 → 시군구 2단계 선택 후 그 시군구만 검색.
 *      (원 설계는 광역시 탭 즉시 전체 검색이지만, 호출 절약 원칙에 따라
 *      광역시도 시군구 선택으로 통일 — 부산 전체 즉시 검색은 16회 소비.
 *      서울 선택은 기존 /physical로 이동.)
 *
 * 정보나루 제약 안내 3종(전일 기준 / 권수 미제공 / 신간 누락 가능)은
 * 이 화면과 지도 화면 양쪽에 표기.
 */

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ApiResponse, KakaoBookCandidate } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { KoreaRegionMap } from "@/components/search/KoreaRegionMap";
import {
  SearchUnit,
  getNearbyUnits,
  getUnitsByRegion,
} from "@/lib/data/searchUnits";

const REGION_ORDER: { region: string; label: string }[] = [
  { region: "11", label: "서울" },
  { region: "31", label: "경기" },
  { region: "23", label: "인천" },
  { region: "21", label: "부산" },
  { region: "22", label: "대구" },
  { region: "24", label: "광주" },
  { region: "25", label: "대전" },
  { region: "26", label: "울산" },
  { region: "29", label: "세종" },
  { region: "32", label: "강원" },
  { region: "33", label: "충북" },
  { region: "34", label: "충남" },
  { region: "35", label: "전북" },
  { region: "36", label: "전남" },
  { region: "37", label: "경북" },
  { region: "38", label: "경남" },
  { region: "39", label: "제주" },
];

type PageState =
  | { step: "idle" }
  | { step: "loadingCandidates"; query: string }
  | { step: "candidates"; query: string; candidates: KakaoBookCandidate[] }
  | { step: "locating"; book: KakaoBookCandidate }
  | { step: "regionSelect"; book: KakaoBookCandidate }
  | { step: "districtSelect"; book: KakaoBookCandidate; region: string }
  | { step: "error"; message: string };

export default function NationwidePhysicalPage() {
  return (
    <Suspense>
      <NationwideInner />
    </Suspense>
  );
}

function NationwideInner() {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ step: "idle" });
  const [searchValue, setSearchValue] = useState("");

  async function handleSearch(query: string) {
    setState({ step: "loadingCandidates", query });
    try {
      const res = await fetch(`/api/book-candidates?q=${encodeURIComponent(query)}`);
      const json: ApiResponse<KakaoBookCandidate[]> = await res.json();
      if (!json.success) throw new Error(json.error);
      if (json.data.length === 0) {
        setState({ step: "error", message: "책을 찾지 못했어요. 다른 제목으로 검색해보세요." });
        return;
      }
      setState({ step: "candidates", query, candidates: json.data });
    } catch (e) {
      setState({
        step: "error",
        message: e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.",
      });
    }
  }

  function goToMap(book: KakaoBookCandidate, units: SearchUnit[]) {
    const codes = units.map((u) => u.code).join(",");
    router.push(
      `/physical/all/map/${book.isbn}?title=${encodeURIComponent(book.title)}&units=${codes}`
    );
  }

  async function handlePickBook(book: KakaoBookCandidate) {
    setState({ step: "locating", book });
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
        setState({ step: "regionSelect", book });
        return;
      }
      // 가장 가까운 시군구가 서울이면 기존 서울 파이프라인(스크래핑
      // 실권수·실시간)으로 — 지도 화면이 ISBN+위치로 자체 검색한다.
      if (nearby[0].region === "11") {
        router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
        return;
      }
      goToMap(book, nearby);
    } catch {
      // 위치 없음 — 시도 선택으로
      setState({ step: "regionSelect", book });
    }
  }

  function handlePickRegion(book: KakaoBookCandidate, region: string) {
    if (region === "11") {
      // 서울은 기존 파이프라인 — 위치 없는 검색도 기존 화면이 전체 구를 처리
      router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
      return;
    }
    const units = getUnitsByRegion(region).filter((u) => u.libCount > 0);
    if (units.length === 1) {
      goToMap(book, units); // 세종처럼 단일 시군구는 바로 검색
      return;
    }
    setState({ step: "districtSelect", book, region });
  }

  const noticeBlock = (
    <p className="text-gray-300 text-xs leading-relaxed text-center">
      전국 도서관 데이터는 도서관 정보나루 기준이에요.
      <br />
      대출가능 여부는 전일 기준이고, 보유 권수는 제공되지 않아요.
      <br />
      최근에 들어온 신간은 빠져 있을 수 있어요.
    </p>
  );

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <a href="/physical/all">
              <img src="/logo-header.png" alt="지금빌려" style={{ height: "40px", width: "107px" }} />
            </a>
            <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              종이책 · 전국
            </span>
          </div>
          <p className="text-xs text-gray-400">
            그 책, 지금 어디서 빌릴 수 있지?
            <br />
            <span className="text-[#1d2b6b] font-bold" style={{ textShadow: "0 1px 1px rgba(29,43,107,0.18)" }}>
              전국 도서관
            </span>
            에서 찾아볼게요.
          </p>
        </div>
        <SearchBar
          onSearch={handleSearch}
          loading={state.step === "loadingCandidates"}
          value={searchValue}
          onChange={setSearchValue}
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
            {noticeBlock}
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

        {state.step === "locating" && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">현재 위치 확인 중...</p>
          </div>
        )}

        {state.step === "regionSelect" && (
          <div className="px-4">
            <p className="text-sm text-gray-600 font-medium mb-1">
              어느 지역에서 찾을까요?
            </p>
            <p className="text-xs text-gray-400 mb-3">
              위치 정보가 없어 지역을 직접 선택해 주세요.
            </p>
            <div className="max-w-sm mx-auto">
              <KoreaRegionMap onSelect={(region) => handlePickRegion(state.book, region)} />
            </div>
            <div className="mt-8">{noticeBlock}</div>
          </div>
        )}

        {state.step === "districtSelect" && (
          <div className="px-4">
            <button
              onClick={() => setState({ step: "regionSelect", book: state.book })}
              className="text-xs text-gray-400 mb-2"
            >
              ← 지역 다시 선택
            </button>
            <p className="text-sm text-gray-600 font-medium mb-3">
              {REGION_ORDER.find((r) => r.region === state.region)?.label} — 시군구를 선택하세요
            </p>
            <div className="grid grid-cols-3 gap-2">
              {getUnitsByRegion(state.region).map((u) => (
                <button
                  key={u.code}
                  disabled={u.libCount === 0}
                  onClick={() => goToMap(state.book, [u])}
                  className="py-3 px-1 rounded-xl bg-white border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-emerald-50 disabled:opacity-40"
                >
                  {u.district}
                  {u.libCount === 0 ? (
                    <span className="block text-[10px] font-normal text-gray-400">참여관 없음</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="mt-8">{noticeBlock}</div>
          </div>
        )}

        {state.step === "error" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
