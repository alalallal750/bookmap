"use client";

/**
 * [2026-07-18 신규 — 전국판] 전국 종이책 지도 화면.
 *
 * 기존 서울 지도(/physical/map/[isbn])와 별개 — 기존 파이프라인 무수정
 * 원칙. 서울 지도의 검증된 패턴(카카오 SDK 로드, CustomOverlay 마커,
 * LibraryDetail 재사용)만 가져오고 서울 전용 로직(구 dbnum, 재검색 UX,
 * sessionStorage 캐시)은 뺀 가벼운 버전.
 *
 * 전국판 호출 절약 원칙:
 *   - 진입 시 /api/nationwide-physical 1회 (시군구당 libSrchByBook 1~2회)
 *   - 마커는 "소장"으로 표시 — 대출가능 여부는 모름
 *   - 마커 탭 시 /api/naru-book-exist로 그 도서관 1건만 조회해
 *     "가능"/"대출중"으로 갱신 (6시간 캐시)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary } from "@/types";
import { formatLibraryName } from "@/lib/utils/formatLibraryName";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { getSearchUnit } from "@/lib/data/searchUnits";

function LoadingDots({ message }: { message: string }) {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDotCount((c) => (c + 1) % 4), 400);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ width: "220px", textAlign: "center", minHeight: "80px" }}>
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <div style={{ display: "flex", justifyContent: "center", fontSize: "14px", fontWeight: 500, color: "#374151" }}>
        <span>{message.replace(/\.+$/, "")}</span>
        <span style={{ width: "20px", textAlign: "left" }}>{"...".slice(0, dotCount)}</span>
      </div>
    </div>
  );
}

/**
 * 마커 라벨 — 전국판은 "소장"(대출가능 미확인)에서 시작해, 탭해서 확인한
 * 곳만 "가능"/"대출중"으로 바뀐다 (available === undefined가 미확인 상태).
 */
function createOverlayContent(lib: PhysicalLibrary, onClick: () => void) {
  const unknown = lib.available === undefined;
  const color = unknown ? "#059669" : lib.available ? "#2563eb" : "#888780";
  const label = unknown ? "소장" : lib.available ? "가능" : "대출중";
  const div = document.createElement("div");
  div.style.cssText = `background:${color};color:white;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:500;text-align:center;cursor:pointer;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);line-height:1.4;`;
  div.innerHTML = `${formatLibraryName(lib.libraryName)}<br><span style="font-size:11px;opacity:0.9;">${label}</span>`;
  div.addEventListener("click", onClick);
  return div;
}

type MapPageProps = {
  params: { isbn: string };
  searchParams: { title?: string; units?: string };
};

export default function NationwideMapPage({ params, searchParams }: MapPageProps) {
  const { isbn } = params;
  const title = searchParams?.title;
  const unitsParam = searchParams?.units ?? "";

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const hasLoadedRef = useRef(false);
  // 온디맨드 대출확인 중복 호출 방지 (libCode 단위)
  const checkingRef = useRef<Set<string>>(new Set());

  const [libraries, setLibraries] = useState<PhysicalLibrary[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PhysicalLibrary | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [districtLabel, setDistrictLabel] = useState("");
  const [failedDistricts, setFailedDistricts] = useState<string[]>([]);

  // 사용자 위치 (지도 중심·현위치 dot용 — 검색에는 불필요, units가 이미 확정)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  // 소장 검색 — units 기준 1회
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    (async () => {
      try {
        const url = new URL("/api/nationwide-physical", window.location.origin);
        url.searchParams.set("isbn", isbn);
        if (title) url.searchParams.set("title", title);
        url.searchParams.set("units", unitsParam);
        const res = await fetch(url.toString());
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "검색에 실패했습니다.");
        setLibraries(json.libraries as PhysicalLibrary[]);
        // [07-18 시도 단위 전환] 마커는 시도 전체 — 라벨도 시도 기준으로.
        const regionMeta: { province: string }[] = json.meta?.regions ?? [];
        setDistrictLabel(
          regionMeta.length > 0 ? `${regionMeta.map((r) => r.province).join(", ")} 전체` : ""
        );
        const failed: string[] = (json.meta?.failedRegions ?? []).map(
          (f: { province: string }) => f.province
        );
        setFailedDistricts(failed);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isbn, title, unitsParam]);

  // 카카오맵 SDK 로드 (서울 지도와 동일 패턴)
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

  // 지도 초기화 — 검색 단위 중심(첫 unit) 또는 사용자 위치
  useEffect(() => {
    if (!mapReady || loading || !mapContainerRef.current || mapRef.current) return;
    const firstUnit = getSearchUnit(unitsParam.split(",")[0] ?? "");
    const centerSrc =
      userLocation ??
      (firstUnit?.lat !== undefined ? { lat: firstUnit.lat, lng: firstUnit.lng! } : null) ??
      (libraries[0]
        ? { lat: libraries[0].latitude, lng: libraries[0].longitude }
        : { lat: 36.5, lng: 127.8 }); // 전국 중앙 근사 — 결과 0건 + 위치 없음일 때만
    const center = new window.kakao.maps.LatLng(centerSrc.lat, centerSrc.lng);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center,
      level: libraries.length > 0 ? 7 : 11,
    });
    if (process.env.NODE_ENV === "development") (window as any).__map = mapRef.current;
  }, [mapReady, loading, userLocation, libraries, unitsParam]);

  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    libraries.forEach((lib) => {
      const content = createOverlayContent(lib, () => handleSelectLibrary(lib));
      const overlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
        content,
        yAnchor: 1.3,
        map,
      });
      overlaysRef.current.push(overlay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraries]);

  useEffect(() => {
    if (mapRef.current) drawMarkers();
  }, [drawMarkers, mapReady, loading]);

  // 사용자 위치 dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    if (userMarkerRef.current) userMarkerRef.current.setMap(null);
    if (!userLocation) return;
    const dot = document.createElement("div");
    dot.style.cssText = `width:12px;height:12px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.25);`;
    userMarkerRef.current = new (window.kakao.maps as any).CustomOverlay({
      position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
      content: dot,
      yAnchor: 0.5,
      map,
    });
  }, [userLocation, mapReady, loading]);

  /**
   * 마커 탭 → 상세패널 열기 + 그 도서관 1건만 온디맨드 대출확인.
   * 실패(한도 초과 등)하면 "소장" 상태 유지 — 악화 없음.
   */
  function handleSelectLibrary(lib: PhysicalLibrary) {
    setSelectedLibrary({ ...lib });
    if (lib.available !== undefined) return; // 이미 확인됨
    const libCode = lib.id.replace(/^naru_/, "");
    if (checkingRef.current.has(libCode)) return;
    checkingRef.current.add(libCode);
    (async () => {
      try {
        const res = await fetch(
          `/api/naru-book-exist?isbn=${encodeURIComponent(isbn)}&libCode=${encodeURIComponent(libCode)}`
        );
        const json = await res.json();
        if (!json.success || !json.known) return;
        // hasBook=false(월 단위 병합 데이터의 시차)도 보수적으로 "대출중" 취급
        const available: boolean = json.hasBook === true && json.loanAvailable === true;
        setLibraries((prev) =>
          prev.map((l) => (l.id === lib.id ? { ...l, available } : l))
        );
        setSelectedLibrary((sel) =>
          sel && sel.id === lib.id ? { ...sel, available } : sel
        );
      } catch {
        // 조용히 무시 — "소장" 표시 유지
      } finally {
        checkingRef.current.delete(libCode);
      }
    })();
  }

  function moveToUser() {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng));
    mapRef.current.setLevel(5);
  }

  const holdingCount = libraries.length;

  return (
    <main className="h-screen h-dvh flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/physical/all"
            className="p-2 -ml-2 text-gray-500"
            aria-label="뒤로가기"
            onClick={() => {
              // 검색 화면이 sessionStorage의 결과를 복원하도록 "지도에서
              // 돌아옴" 플래그를 남김 (서울판 RETURN_FROM_MAP 패턴)
              try {
                sessionStorage.setItem("nationwide_returning_from_map", "1");
              } catch {}
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 text-sm line-clamp-1">{title ?? "도서관 찾기"}</h1>
            <p className="text-xs text-gray-400 line-clamp-1">
              {districtLabel ? `${districtLabel} · ` : ""}대출가능은 전일 기준 · 권수 미제공
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {(loading || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-lg">
              <LoadingDots message={mapReady ? "소장 도서관 찾는 중..." : "지도를 불러오는 중..."} />
            </div>
          </div>
        )}

        {!loading && mapReady && errorMsg && (
          <div className="absolute inset-x-3 top-3 z-10 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-xs text-red-600">
            {errorMsg}
          </div>
        )}

        {!loading && mapReady && !errorMsg && (
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-col items-start gap-1.5">
            <div className="bg-white rounded-2xl px-4 py-2 shadow text-xs font-medium text-gray-800">
              {holdingCount > 0 ? (
                <>
                  이 책을 소장한 도서관 <span className="text-emerald-600 font-bold">{holdingCount}</span>곳
                  <span className="block text-[10px] text-gray-400 mt-0.5">
                    마커를 누르면 대출가능 여부를 확인해요 (전일 기준)
                  </span>
                </>
              ) : (
                <>이 지역 도서관에서는 소장을 확인하지 못했어요</>
              )}
            </div>
            {failedDistricts.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-1.5 text-[11px] text-amber-700">
                {failedDistricts.join(", ")}은(는) 일시적으로 조회하지 못했어요
              </div>
            )}
          </div>
        )}

        {!selectedLibrary && userLocation && (
          <div className="absolute right-3 z-10" style={{ bottom: "2rem" }}>
            <button onClick={moveToUser} className="bg-white shadow rounded-xl p-2.5 cursor-pointer" aria-label="현재 위치로 이동">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="3" fill="#2563eb" />
                <circle cx="10" cy="10" r="7" stroke="#2563eb" strokeWidth="1.5" />
                <path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
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
