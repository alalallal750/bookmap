"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary, PhysicalBook, PhysicalSearchResponse, ApiResponse } from "@/types";
import { formatLibraryName } from "@/lib/utils/formatLibraryName";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { BookStoryStrip } from "@/components/map/BookStoryStrip";
import { DEFAULT_LOCATION, getNearbyDbnums, getNearbyUnreliableDbnums, getDistrictName, distanceKm } from "@/lib/data/districtCoords";

// [2026-06-24 추가] 지도 이동 시 "이 지역에서 재검색" UX 관련 상수
// - 진입 후 이 시간(ms) 동안은 이동 감지를 끔(최초 위치 확인/확대 보호)
// - 마지막 검색 위치에서 이 거리(km) 이상 벗어나야 "재검색 찾기" 문구로 전환
const MOVE_DETECTION_DELAY_MS = 10000;
const MOVE_DETECTION_DISTANCE_KM = 5;

// [2026-07-10 추가] 제목 검색(캐시)에 절대 안 담기는 구 — 통합검색이 ISBN을
// 안 줘서(송파·성북) 또는 비표준이라(금천) 스크래핑 결과가 항상 버려지는
// 구. 캐시 진입 시 이 구들 + 검색 실패 구(failedGus)를 정보나루로 보강한다.
const NARU_ALWAYS_GUS = ["금천구", "송파구", "성북구"];

// 주소 문자열에서 구 이름 추출 — 캐시에 이미 결과가 있는 구를 정보나루
// 보강 대상에서 빼는 데 사용("한 구의 결과는 한 소스" 원칙).
function extractGuFromAddress(address: string | undefined): string | undefined {
  return address?.match(/([가-힣]{1,4}구)(?=\s|$)/)?.[1];
}

function LoadingDots({ message }: { message: string }) {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDotCount((c) => (c + 1) % 4), 400);
    return () => clearInterval(timer);
  }, []);
  const baseMsg = message.replace(/\.+$/, "");
  return (
    <div style={{ width: "200px", textAlign: "center", minHeight: "80px" }}>
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <div style={{ display: "flex", justifyContent: "center", fontSize: "14px", fontWeight: 500, color: "#374151" }}>
        <span>{baseMsg}</span>
        <span style={{ width: "20px", textAlign: "left" }}>{"...".slice(0, dotCount)}</span>
      </div>
    </div>
  );
}

// [2026-06-24 추가] 좌표 기준으로 "구 이름, 구 이름" 형태 라벨 생성.
// getNearbyDbnums가 반경 5km 안의 구 dbnum들을 반환하므로, 그걸 구
// 이름으로 변환. 하나도 안 잡히면(이론상 fallback으로 최소 1곳은 항상
// 반환되므로 거의 발생 안 함) 빈 문자열.
function computeDistrictLabel(lat: number, lng: number): string {
  const dbnums = getNearbyDbnums(lat, lng);
  const names = dbnums
    .map((dbnum) => getDistrictName(dbnum))
    .filter((name): name is string => Boolean(name));
  const uniqueNames = Array.from(new Set(names));
  return uniqueNames.join(", ");
}

function getMarkerColor(lib: PhysicalLibrary): string {
  if (!lib.available) return "#888780";

  // [2026-06-26 비활성화] 구립/작은/스마트도서관 색상 구분 — 정확도
  // 문제로 비활성화. inferLibraryType이 분관 이름에 "작은"/"스마트"
  // 글자가 있는지로 추측하는 방식인데, 실제로 구분이 안 맞는 경우가
  // 많아서(예: 정식 명칭에 "작은도서관"이 안 들어가는 곳들) 일단
  // 끔. 추후 더 정확한 구분 방법(branchHours.ts의 type 필드 등)을
  // 찾으면 아래 주석을 풀어서 복원할 것.
  //
  // if (lib.libraryType === "smart_library") return "#7c3aed";
  // if (lib.libraryType === "small_library") return "#16a34a";
  // if (lib.libraryType === "edu_library") return "#ea580c";

  return "#2563eb";
}

function createCustomOverlay(lib: PhysicalLibrary, onClick: () => void) {
  const color = getMarkerColor(lib);
  // [2026-07-09 변경] 권수를 아는 곳(스크래핑 — 분관별 집계로 실권수)만
  // "N권", 권수 미상(정보나루 — 가능/불가만 제공)은 "가능"/"대출중"으로
  // 표기. 기존의 "availableCount 없으면 1권"은 실데이터가 아니었음.
  const label =
    lib.availableCount !== undefined
      ? `${lib.availableCount}권`
      : lib.available
        ? "가능"
        : "대출중";
  const div = document.createElement("div");
  div.style.cssText = `background:${color};color:white;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:500;text-align:center;cursor:pointer;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);line-height:1.4;`;
  div.innerHTML = `${formatLibraryName(lib.libraryName)}<br><span style="font-size:11px;opacity:0.9;">${label}</span>`;
  div.addEventListener("click", onClick);
  return div;
}

// [2026-06-26 비활성화] 유형 구분 정확도 문제로 범례 표시 끔.
// 복원 시 아래 배열로 되돌리면 됨:
// const LEGEND = [
//   { label: "구립", color: "#2563eb" },
//   { label: "작은", color: "#16a34a" },
//   { label: "스마트", color: "#7c3aed" },
// ];
const LEGEND: { label: string; color: string }[] = [];

type MapPageProps = {
  params: { isbn: string };
  searchParams: { title?: string; from?: string };
};

export default function PhysicalMapPage({ params, searchParams }: MapPageProps) {
  const { isbn } = params;
  const title = searchParams?.title;
  // [2026-07-20] 전국판(/nationwide)에서 서울로 넘어온 경우 — 뒤로가기가
  // 전국판 검색 화면으로 돌아가야 함. 파라미터 없으면 기존 동작 그대로.
  const fromNationwide = searchParams?.from === "nationwide";
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const hasLoadedRef = useRef(false);
  // sessionStorage 캐시를 사용했는지 추적 — userLocation 도착 시 lastSearchedLocation 보정에 사용
  const usedCacheRef = useRef(false);
  // [2026-07-10 추가] nearby 캐시 진입 시 정보나루 보강을 GPS 확보 후로 미룸
  const pendingNaruMergeRef = useRef<{ libs: PhysicalLibrary[]; failedGus?: string[] } | null>(null);

  const [libraries, setLibraries] = useState<PhysicalLibrary[]>([]);
  // [2026-07-09 변경] undefined = 위치 조회 중, null = 실패/미지원, 좌표 = 성공.
  // 기존엔 "조회 중"과 "실패"가 둘 다 null이라 최초 검색이 GPS 응답을 기다리지
  // 않고 기본좌표(방배)로 나갔음 — 위치 없는 사용자의 전체 구 검색이 항상
  // 방배 근처 3구로 좁혀지던 원인.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  const [selectedLibrary, setSelectedLibrary] = useState<PhysicalLibrary | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("도서관 찾는 중...");
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  // [2026-06-24 추가] "이 지역에서 재검색" UX 상태
  // lastSearchedLocation: 마지막으로 실제 검색을 실행한 위치(거리 비교 기준점)
  // districtLabel: 현재 표시 중인 구 이름들(예: "동작구, 서초구")
  // showResearchPrompt: true면 "OO에서 도서 찾기" 안내 버튼 상태로 전환
  // pendingLocation: "찾기" 클릭 시 검색에 사용할 새 위치(지도 idle 시점에 저장)
  const [lastSearchedLocation, setLastSearchedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [districtLabel, setDistrictLabel] = useState<string>("");
  const [showResearchPrompt, setShowResearchPrompt] = useState(false);
  // [2026-06-24 추가] "nearby"면 기존처럼 지도 이동 시 재검색 UI 동작,
  // "all"이면 이미 서울 전체를 검색해서 들고 있으므로 재검색 UI 전체를
  // 숨김. runSearch(직접 API 호출 경로)는 항상 nearby로 간주 — 위치
  // 기준 좁은 검색을 하는 함수이므로.
  const [searchScope, setSearchScope] = useState<"nearby" | "all">("nearby");
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [researching, setResearching] = useState(false);
  const moveDetectionEnabledRef = useRef(false);

  // 로딩 메시지 순차 변경
  useEffect(() => {
    if (!loading) return;
    const messages = [
      { text: "25개 구 도서관 검색 중...", delay: 0 },
      { text: "작은도서관·스마트도서관 확인 중...", delay: 4000 },
      { text: "거의 다 됐어요...", delay: 9000 },
    ];
    const timers = messages.map(({ text, delay }) => setTimeout(() => setLoadingMessage(text), delay));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // 위치 먼저 확보 (검색 API 호출에 필요)
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  // [2026-06-24 변경] 검색 로직을 함수로 분리 — 최초 진입 시와 "찾기" 버튼
  // 클릭 시(재검색) 둘 다 같은 책(title/isbn)을 기준으로, 위치만 바꿔서
  // 호출하는 공용 함수. 호출 성공 시 lastSearchedLocation을 그 위치로
  // 갱신하고, 15초 보호시간 타이머를 다시 시작함(moveDetectionEnabledRef).
  /**
   * [2026-06-24 변경] 제목 기반(/api/physical-search) → ISBN 기반
   * (/api/physical-search-by-isbn)으로 변경. 이전 구조는 ISBN을 이미
   * 알고 있으면서도 다시 제목으로 25개 구를 검색해 그 응답 안에서
   * b.isbn === isbn인 책만 찾는 방식이었음 — 이러면 카카오로 ISBN을
   * 확정해서 들어온 의미가 사라지고, 제목 검색 특유의 문제(송파구·
   * 성북구가 제목 검색 응답에 ISBN을 안 주는 문제, 이슈 D)가 지도
   * 화면에서 그대로 재발함. ISBN으로 직접 검색하면 이 문제가 없음
   * (2026-06-24 실측 확인).
   */
  /**
   * [2026-06-24 변경] /api/physical-search 응답 형태가 PhysicalBook[]
   * → { books, meta }로 바뀜에 따라 json.data.books를 읽도록 변경.
   * 이 함수는 항상 좌표(lat, lng)를 받아 "그 위치 기준 좁은 범위"를
   * 검색하는 함수이므로, 호출될 때마다 searchScope를 "nearby"로
   * 명시 — 혹시 이전에 sessionStorage에서 scope: "all"로 세팅된
   * 상태였더라도, runSearch가 한 번이라도 호출되면(최초 진입 시 캐시가
   * 없어서거나, 사용자가 "찾기" 버튼을 눌러서) 그 시점부터는 위치 기준
   * 검색이 시작된 것이므로 "all" 상태로 남아있으면 안 됨.
   */
  // [2026-07-09 변경] 좌표를 옵셔널로 — 좌표 없이 호출하면 서버가 25개 구
  // 전체를 검색(scope "all"). 좌표가 있으면 기존과 동일한 근처 검색.
  // 응답이 NDJSON 스트림으로 바뀜에 따라(/api/physical-search와 동일 형식)
  // progress 이벤트로 "ㅇㅇ구 확인 중" 로딩 문구를 갱신.
  const runSearch = useCallback(
    async (lat?: number, lng?: number) => {
      try {
        const hasCoords = lat !== undefined && lng !== undefined;
        const url = new URL("/api/physical-search-by-isbn", window.location.origin);
        url.searchParams.set("isbn", isbn);
        url.searchParams.set("title", title ?? isbn);
        if (hasCoords) {
          url.searchParams.set("lat", String(lat));
          url.searchParams.set("lng", String(lng));
        }

        const res = await fetch(url.toString());
        if (!res.body) throw new Error("스트림 없음");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let finalBooks: PhysicalBook[] | null = null;
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
            if (data.type === "progress") {
              setLoadingMessage(`${data.gu} 도서관 확인 중...`);
            } else if (data.type === "done" && data.success) {
              finalBooks = data.data;
            }
          }
        }
        if (!finalBooks) return;

        const matched = finalBooks.find((b) => b.isbn === isbn);
        setLibraries(matched?.libraries ?? []);
        setSearchScope(hasCoords ? "nearby" : "all");

        // 검색 기준점 갱신 + 구 이름 라벨 갱신 + 이동 감지 타이머 재시작
        // (전체 검색이면 재검색 UI가 통째로 숨으므로 기준점·라벨 불필요)
        if (hasCoords) {
          setLastSearchedLocation({ lat: lat!, lng: lng! });
          setDistrictLabel(computeDistrictLabel(lat!, lng!));
        }
        setShowResearchPrompt(false);
        setPendingLocation(null);

        moveDetectionEnabledRef.current = false;
        setTimeout(() => {
          moveDetectionEnabledRef.current = true;
        }, MOVE_DETECTION_DELAY_MS);
      } catch (e) {
        console.log("[physical map] runSearch failed:", e);
      }
    },
    [isbn, title]
  );

  /**
   * [2026-06-24 추가] 최초 진입 시, 검색 화면이 sessionStorage에
   * 저장해둔 데이터가 있는지 먼저 확인 — 있으면 그걸로 바로 마커를
   * 그리고 API 호출(서울도서관 재검색)을 건너뜀. 검색 화면에서 이미
   * 도서관별 대출가능 여부까지 다 받아온 데이터를 또 물어보는 중복을
   * 없애기 위함(서울도서관 서버 부담 절반으로 줄임, 2026-06-24).
   *
   * sessionStorage에 없으면(사용자가 이 지도 URL로 직접 들어온 경우,
   * 브라우저를 새로고침한 경우, 저장이 실패했던 경우 등) 기존처럼
   * runSearch를 호출해 자체적으로 검색 — 안전장치로 유지.
   *
   * sessionStorage에서 읽은 데이터를 쓸 때도 lastSearchedLocation,
   * districtLabel, 이동감지 타이머를 정상적으로 세팅해야 함 — 그래야
   * 그 이후 "지도 이동 시 재검색" 기능이 똑같이 잘 동작함.
   */
  /**
   * [2026-06-24 변경] sessionStorage 저장 형태가 PhysicalBook →
   * { book: PhysicalBook, scope: "nearby" | "all" }로 바뀜에 따라
   * 읽는 쪽도 맞춰 변경. scope가 "all"이면(위치 없어 25개 구 전체를
   * 이미 다 검색한 경우) searchScope를 "all"로 세팅 — 이 값으로
   * "이 지역에서 재검색" UI 전체를 숨김(아래 checkMapMoved, 화면
   *렌더링 부분 참조). 이미 서울 전체를 다 검색해서 들고 있으므로,
   * 지도를 어디로 옮기든 추가 검색이 필요 없음.
   */
  useEffect(() => {
    async function initialLoad() {
      // userLocation이 나중에 들어올 때 재실행되지 않도록 한 번만 실행
      if (hasLoadedRef.current) return;

      // 1) 캐시는 위치와 무관하게 즉시 시도 — 검색 화면에서 넘어온 경우
      //    GPS 대기 없이 바로 마커를 그린다 (기존 동작 유지)
      try {
        const cached = sessionStorage.getItem(`physical_book_${isbn}`);
        if (cached) {
          hasLoadedRef.current = true;
          const parsed: { book: PhysicalBook; scope: "nearby" | "all"; failedGus?: string[] } =
            JSON.parse(cached);
          const libs = parsed.book.libraries ?? [];
          setLibraries(libs);
          setSearchScope(parsed.scope);

          // [2026-07-10 추가] 캐시(제목 검색 결과)에는 정보나루 결과가 없다 —
          // 제목 검색은 ISBN을 못 얻는 구(금천·송파·성북)를 항상 버리고,
          // 실패한 구(노원·중구 타임아웃 등)의 폴백도 없기 때문. 여기서
          // 그 구들만 백그라운드로 보강 조회해 마커에 합친다. 사용자는
          // 아무 조작 없이 잠시 뒤 마커가 추가되는 것만 본다.
          // scope가 "nearby"면 상시 구도 근처 기준으로 골라야 하므로 GPS
          // 확보(userLocation 확정)를 기다렸다가 아래 useEffect에서 실행.
          if (parsed.scope === "all") {
            void mergeNaruLibraries(libs, parsed.failedGus, null);
          } else {
            pendingNaruMergeRef.current = { libs, failedGus: parsed.failedGus };
          }

          if (parsed.scope === "nearby") {
            // lastSearchedLocation은 userLocation이 확보된 뒤 별도 useEffect에서 세팅.
            // 여기서 DEFAULT_LOCATION을 쓰면 실제 GPS와 달라 버튼이 잘못 표시됨.
            usedCacheRef.current = true;
            setShowResearchPrompt(false);
            setPendingLocation(null);

            moveDetectionEnabledRef.current = false;
            setTimeout(() => {
              moveDetectionEnabledRef.current = true;
            }, MOVE_DETECTION_DELAY_MS);
          }

          sessionStorage.removeItem(`physical_book_${isbn}`);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.log("[physical map] sessionStorage 읽기 실패, API로 진행:", e);
      }

      // 2) 캐시가 없으면 위치 확보가 끝날 때까지 대기 — getCurrentPosition은
      //    성공(좌표) 또는 실패(null)로 최대 5초 안에 반드시 끝난다.
      //    [2026-07-09] 기존엔 여기서 기다리지 않고 기본좌표(방배)로 검색해,
      //    위치 없는 사용자도 방배 근처 3구만 검색되던 버그가 있었음.
      if (userLocation === undefined) return; // 위치 조회 중 — 해결되면 effect 재실행

      hasLoadedRef.current = true;
      await runSearch(userLocation?.lat, userLocation?.lng);
      setLoading(false);
    }
    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn, title, userLocation]);
  // 캐시로 진입한 경우, GPS 확보 시점에 lastSearchedLocation을 실제 위치로 보정
  // (initialLoad가 GPS 없이 DEFAULT_LOCATION으로 세팅하는 race condition 방지)
  useEffect(() => {
    if (!userLocation || loading || !usedCacheRef.current) return;
    setLastSearchedLocation(userLocation);
  }, [userLocation, loading]);

  // [2026-07-10 추가] nearby 캐시 진입의 정보나루 보강 — GPS 확정(성공 또는
  // 실패 null) 시점에 실행. GPS 실패면 근처를 알 수 없으므로 상시 구 전체를
  // 조회(nearby 검색이었다면 드문 경우, 과조회 감수).
  useEffect(() => {
    const pending = pendingNaruMergeRef.current;
    if (!pending || userLocation === undefined) return;
    pendingNaruMergeRef.current = null;
    void mergeNaruLibraries(pending.libs, pending.failedGus, userLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  /**
   * [2026-07-10 추가] 캐시 진입 시 정보나루 보강 — 상시 구(금천·송파·성북)
   * + 제목 검색에서 fetch 실패한 구 중, 캐시에 결과가 하나도 없는 구만
   * /api/naru-physical로 조회해 마커에 합친다. 실패하면 조용히 넘어감
   * (기존 캐시 마커에는 영향 없음).
   *
   * location이 있으면(원래 검색이 nearby) 상시 구도 근처(반경 5km)에 있는
   * 것만 조회 — ISBN 흐름의 getNearbyUnreliableDbnums와 같은 기준. 노원
   * 근처 사용자를 위해 송파·성북·금천까지 조회하는 낭비(정보나루 한도)를
   * 막는다. failedGus는 원래 검색 대상이었던 구이므로 위치와 무관하게 포함.
   */
  async function mergeNaruLibraries(
    cachedLibs: PhysicalLibrary[],
    failedGus: string[] | undefined,
    location: { lat: number; lng: number } | null
  ) {
    try {
      const alwaysGus = location
        ? [
            ...getNearbyDbnums(location.lat, location.lng),
            ...getNearbyUnreliableDbnums(location.lat, location.lng),
          ]
            .map((d) => getDistrictName(d))
            .filter((gu): gu is string => Boolean(gu) && NARU_ALWAYS_GUS.includes(gu!))
        : NARU_ALWAYS_GUS;

      const cachedGus = new Set(
        cachedLibs.map((l) => extractGuFromAddress(l.address)).filter(Boolean)
      );
      const targetGus = [...new Set([...alwaysGus, ...(failedGus ?? [])])].filter(
        (gu) => !cachedGus.has(gu)
      );
      if (targetGus.length === 0) return;

      const url = new URL("/api/naru-physical", window.location.origin);
      url.searchParams.set("isbn", isbn);
      if (title) url.searchParams.set("title", title);
      url.searchParams.set("gus", targetGus.join(","));

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!json.success || !Array.isArray(json.libraries) || json.libraries.length === 0) return;

      setLibraries((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const added = (json.libraries as PhysicalLibrary[]).filter((l) => !existingIds.has(l.id));
        console.log(`[physical map] 정보나루 보강: ${targetGus.join(",")} — ${added.length}관 추가`);
        return added.length > 0 ? [...prev, ...added] : prev;
      });
    } catch (e) {
      console.log("[physical map] 정보나루 보강 실패 (무시):", e);
    }
  }

  // "찾기" 버튼 클릭 시 재검색
  async function handleResearchClick() {
    if (!pendingLocation || researching) return;
    setResearching(true);
    await runSearch(pendingLocation.lat, pendingLocation.lng);
    setResearching(false);
  }

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDesktop(!isMobile);
  }, []);

  // 카카오맵 SDK 로드
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) return;
    if (window.kakao?.maps) {
      setMapReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => setMapReady(true));
    document.head.appendChild(script);
  }, []);

  // 지도 초기화 — 사용자 위치 있으면 그 위치, 없으면 DEFAULT_LOCATION
  useEffect(() => {
    if (!mapReady || loading || !mapContainerRef.current || mapRef.current) return;
    const center = userLocation
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, { center, level: 6 });
    // 개발 모드 전용 — 브라우저 콘솔/자동화 검증에서 지도 조작용
    if (process.env.NODE_ENV === "development") (window as any).__map = mapRef.current;
  }, [mapReady, userLocation, loading]);

  const updateVisibleCount = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const bounds = map.getBounds();
    const count = libraries
      .filter((lib) => {
        if (!lib.available) return false;
        return bounds.contain(new window.kakao.maps.LatLng(lib.latitude, lib.longitude));
      })
      .reduce((sum, lib) => sum + ((lib as any).availableCount ?? 1), 0);
    setVisibleAvailableCount(count);
  }, [libraries]);

  // [2026-06-24 추가] 지도가 멈출 때(idle) 호출 — 15초 보호시간이 지난
  // 뒤부터, 마지막 검색 위치 대비 5km 이상 벗어났는지 확인. 벗어났으면
  // "찾기" 안내로 전환하고, 그 시점 좌표를 pendingLocation에 저장.
  // 아직 보호시간 중이거나 5km 미만이면 아무 동작 안 함(중복 호출돼도
  // 안전 — 이미 showResearchPrompt가 true면 굳이 다시 안 바꿔도 결과 동일).
  const checkMapMoved = useCallback(() => {
    if (searchScope === "all") return;
    const map = mapRef.current;
    if (!map || !lastSearchedLocation) return;
    if (!moveDetectionEnabledRef.current) return;

    const center = map.getCenter();
    const currentLat = center.getLat();
    const currentLng = center.getLng();

    // 이미 검색된 구 집합 vs 현재 지도 중심 기준 검색 대상 구 비교.
    // 거리 기반 대신 dbnum 집합 차이로 판단 — "이미 결과가 있는 구"에서
    // 머물고 있을 때는 버튼이 뜨지 않고, 새 구가 범위에 들어올 때만 표시.
    const searchedSet = new Set(getNearbyDbnums(lastSearchedLocation.lat, lastSearchedLocation.lng));
    const currentDbnums = getNearbyDbnums(currentLat, currentLng);
    const newDbnums = currentDbnums.filter((d) => !searchedSet.has(d));

    if (newDbnums.length > 0) {
      const newNames = newDbnums
        .map((d) => getDistrictName(d))
        .filter((n): n is string => Boolean(n))
        .join(", ");
      setPendingLocation({ lat: currentLat, lng: currentLng });
      setDistrictLabel(newNames);
      setShowResearchPrompt(true);
    } else {
      setShowResearchPrompt(false);
    }
  }, [lastSearchedLocation, searchScope]);

  // 라이브러리 마커만 그림 (userLocation 변경 시 재실행 안 됨)
  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    // 좌표가 0,0인 도서관(아직 좌표 수집이 안 된 분관)은 지도에 안 찍음
    libraries
      .filter((lib) => lib.latitude !== 0 || lib.longitude !== 0)
      .forEach((lib) => {
        const content = createCustomOverlay(lib, () => setSelectedLibrary({ ...lib }));
        const overlay = new (window.kakao.maps as any).CustomOverlay({
          position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
          content,
          yAnchor: 1.3,
          map,
        });
        overlaysRef.current.push(overlay);
      });

    updateVisibleCount();
  }, [libraries, updateVisibleCount]);

  // 사용자 위치 dot은 마커 전체 재그리기 없이 별도 업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    if (userMarkerRef.current) userMarkerRef.current.setMap(null);
    if (!userLocation) return;
    const dot = document.createElement("div");
    dot.style.cssText = `width:12px;height:12px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.25);`;
    const userOverlay = new (window.kakao.maps as any).CustomOverlay({
      position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
      content: dot,
      yAnchor: 0.5,
      map,
    });
    userMarkerRef.current = userOverlay;
  }, [userLocation, mapReady]);

  // idle 리스너는 지도 생성 후 한 번만 등록
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    window.kakao.maps.event.addListener(map, "idle", updateVisibleCount);
    window.kakao.maps.event.addListener(map, "idle", checkMapMoved);
    return () => {
      (window.kakao.maps.event as any).removeListener(map, "idle", updateVisibleCount);
      (window.kakao.maps.event as any).removeListener(map, "idle", checkMapMoved);
    };
  }, [mapReady, updateVisibleCount, checkMapMoved]);

  useEffect(() => {
    if (mapRef.current) drawMarkers();
  }, [drawMarkers, mapReady]);

  function moveToUser() {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng));
    mapRef.current.setLevel(4);
  }

  return (
    <main className="h-screen h-dvh flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex-shrink-0 z-20">
        <div className="flex justify-end mb-1.5">
          <div className="flex gap-1.5">
            {LEGEND.map(({ label, color }) => (
              <div
                key={label}
                style={{
                  background: color,
                  color: "white",
                  borderRadius: "10px",
                  padding: "3px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={fromNationwide ? "/nationwide" : "/physical"}
            className="p-2 -ml-2 text-gray-500"
            aria-label="뒤로가기"
            onClick={() => {
              // 전국판 검색 화면이 sessionStorage의 후보 목록을 복원하도록
              // "지도에서 돌아옴" 플래그를 남김 (전국판 지도와 동일 패턴)
              if (fromNationwide) {
                try {
                  sessionStorage.setItem("nationwide_returning_from_map", "1");
                } catch {}
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M13 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 text-sm line-clamp-1">{title ?? "도서관 찾기"}</h1>
            <p className="text-xs text-gray-400">ISBN {isbn}</p>
          </div>
        </div>
        {/* [07-20] 추천 도서 스토리텔링 — 추천 칩·팝업과 동일하게 전국판
            흐름(from=nationwide)에서만. 서울판 자체 검색 적용은 추후 결정. */}
        {fromNationwide && <BookStoryStrip isbn={isbn} />}
      </header>

      {/* 지도 영역 */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {(loading || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-lg">
              <LoadingDots message={mapReady ? loadingMessage : "지도를 불러오는 중..."} />
            </div>
          </div>
        )}

        {!loading && mapReady && !showResearchPrompt && (
          <div className="absolute top-3 left-3 z-10 bg-white rounded-2xl px-4 py-2 shadow text-xs font-medium text-gray-800">
            지금 여기에서 바로 대출 가능한 도서{" "}
            <span className="text-blue-600 font-bold">{visibleAvailableCount}</span>권
          </div>
        )}

        {/* [2026-06-24 변경] searchScope === "all"이면 이미 서울 전체를
            검색해서 들고 있으므로, "이 지역에서 찾기" 버튼이 뜰 일이
            없음 — showResearchPrompt 자체가 checkMapMoved에서 막혀서
            true가 안 되지만, 혹시 모를 경우를 위해 searchScope 조건도
            명시적으로 같이 검사. */}
        {!loading && mapReady && showResearchPrompt && searchScope === "nearby" && (
          <button
            onClick={handleResearchClick}
            disabled={researching}
            className="absolute top-3 left-3 z-10 bg-blue-600 text-white rounded-2xl px-4 py-2 shadow text-xs font-medium disabled:opacity-60"
          >
            {researching ? "찾는 중..." : `지금 ${districtLabel}에서 바로 대출 가능한 도서 찾기`}
          </button>
        )}

        {!selectedLibrary && (
          <div
            className="absolute right-3 z-10"
            style={{ bottom: isDesktop ? "1.5rem" : "2rem" }}
          >
            <button
              onClick={userLocation ? moveToUser : undefined}
              className={`bg-white shadow rounded-xl p-2.5 ${
                !userLocation ? "opacity-50 cursor-default" : "cursor-pointer"
              }`}
              aria-label={userLocation ? "현재 위치로 이동" : "위치 정보 없음"}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="3" fill={userLocation ? "#2563eb" : "#9ca3af"} />
                <circle cx="10" cy="10" r="7" stroke={userLocation ? "#2563eb" : "#9ca3af"} strokeWidth="1.5" />
                <path
                  d="M10 1v3M10 16v3M1 10h3M16 10h3"
                  stroke={userLocation ? "#2563eb" : "#9ca3af"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {!userLocation && (
              <div
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "16px",
                  height: "16px",
                  background: "#ef4444",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        )}

        {selectedLibrary && (
          <div className="absolute inset-0 z-20">
            <LibraryDetail
              library={selectedLibrary}
              bookTitle={title}
              onClose={() => setSelectedLibrary(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}