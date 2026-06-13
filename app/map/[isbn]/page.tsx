"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary, Availability, ApiResponse } from "@/types";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { getCurrentPosition, sortByDistance } from "@/lib/distance";

function getMarkerColor(lib: PhysicalLibrary): string {
  if (!lib.available) return "#888780";
  if (lib.libraryType === "smart_library") return "#7c3aed";
  return "#2563eb";
}

function getLibraryShortName(name: string): string {
  return name.replace(/도서관$/, "").replace(/스마트$/, "").trim();
}

function createCustomOverlay(lib: PhysicalLibrary, onClick: () => void) {
  const color = getMarkerColor(lib);
  const shortName = getLibraryShortName(lib.libraryName);
  const count = (lib as any).availableCount ?? (lib.available ? 1 : 0);
  const div = document.createElement("div");
  div.style.cssText = `
    background: ${color};
    color: white;
    border-radius: 10px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    line-height: 1.4;
  `;
  div.innerHTML = `${shortName}<br><span style="font-size:11px;opacity:0.9;">${count}권</span>`;
  div.addEventListener("click", onClick);
  return div;
}

type MapPageProps = {
  params: { isbn: string };
  searchParams: { title?: string };
};

export default function MapPage({ params, searchParams }: MapPageProps) {
  const { isbn } = params;
  const title = searchParams?.title;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);

  const [libraries, setLibraries] = useState<PhysicalLibrary[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PhysicalLibrary | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("구립도서관 찾는 중...");
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const messages = [
      { text: "구립도서관 찾는 중...", delay: 0 },
      { text: "작은도서관 찾는 중...", delay: 2000 },
      { text: "스마트도서관 찾는 중...", delay: 4000 },
    ];
    const timers = messages.map(({ text, delay }) =>
      setTimeout(() => setLoadingMessage(text), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // 가용성 데이터 로드
  useEffect(() => {
    async function load() {
      try {
        const url = new URL("/api/availability", window.location.origin);
        url.searchParams.set("isbn", isbn);
        if (title) url.searchParams.set("title", title);
        const res = await fetch(url.toString());
        const json: ApiResponse<Availability> = await res.json();
        if (!json.success) return;
        const all = [...json.data.physical, ...json.data.smartLibrary];
        setLibraries(all);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isbn, title]);

  // 현재 위치 요청
  useEffect(() => {
    getCurrentPosition()
      .then((coords) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude });
      })
      .catch(() => {});
  }, []);

  // 카카오맵 SDK 로드
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) return;
    if (window.kakao?.maps) { setMapReady(true); return; }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => setMapReady(true));
    document.head.appendChild(script);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const center = userLocation
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(37.4967, 126.9508);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, { center, level: 5 });
  }, [mapReady, userLocation]);

  // 지도 범위 내 대출가능 카운트
  const updateVisibleCount = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const bounds = (map as any).getBounds();
    const count = libraries.filter((lib) => {
      if (!lib.available) return false;
      const pos = new window.kakao.maps.LatLng(lib.latitude, lib.longitude);
      return bounds.contain(pos);
    }).length;
    setVisibleAvailableCount(count);

    const totalAvailable = libraries.filter((l) => l.available).length;
    setShowGuide(totalAvailable > 0 && count === 0);
  }, [libraries]);

  // 마커(커스텀 오버레이) 렌더링
  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    libraries.forEach((lib) => {
      const content = createCustomOverlay(lib, () => setSelectedLibrary({ ...lib }));
      const overlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
        content,
        yAnchor: 1.3,
        map,
      });
      overlaysRef.current.push(overlay);
    });

    // 내 위치 마커
    if (userLocation) {
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      const dot = document.createElement("div");
      dot.style.cssText = `
        width: 12px; height: 12px;
        background: #2563eb;
        border-radius: 50%;
        border: 2.5px solid white;
        box-shadow: 0 0 0 3px rgba(37,99,235,0.25);
      `;
      const userOverlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        content: dot,
        yAnchor: 0.5,
        map,
      });
      userMarkerRef.current = userOverlay;
      overlaysRef.current.push(userOverlay);
    }

    // 지도 이동 시 카운트 업데이트
    window.kakao.maps.event.addListener(map, "idle", updateVisibleCount);
    updateVisibleCount();
  }, [libraries, userLocation, updateVisibleCount]);

  useEffect(() => {
    if (mapRef.current) drawMarkers();
  }, [drawMarkers, mapReady]);

  function moveToUser() {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng));
    mapRef.current.setLevel(4);
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-gray-500" aria-label="뒤로가기">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-sm line-clamp-1">{title ?? "도서관 찾기"}</h1>
            <p className="text-xs text-gray-400">동작구 · ISBN {isbn}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 relative">
        {/* 지도 */}
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* 로딩 오버레이 */}
        {(loading || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-lg text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-700 font-medium">{mapReady ? loadingMessage : "지도를 불러오는 중..."}</p>
            </div>
          </div>
        )}

        {/* 좌상단: 대출가능 카운트 */}
        {!loading && mapReady && (
          <div className="absolute top-3 left-3 z-10 bg-white rounded-2xl px-4 py-2 shadow text-xs font-medium text-gray-800">
            지금 내 근처에서 바로 대출 가능한 도서 <span className="text-blue-600 font-bold">{visibleAvailableCount}</span>권
          </div>
        )}

        {/* 현재 위치 버튼 */}
        {userLocation && (
          <button onClick={moveToUser} className="absolute top-3 right-3 z-10 bg-white shadow rounded-xl p-2.5" aria-label="현재 위치로 이동">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="3" fill="#2563eb" />
              <circle cx="10" cy="10" r="7" stroke="#2563eb" strokeWidth="1.5" />
              <path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* 안내 문구 */}
        {showGuide && !loading && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-gray-800 bg-opacity-85 text-white text-xs px-5 py-2.5 rounded-full whitespace-nowrap">
            지도를 움직여 대출 가능한 도서를 찾아보세요!
          </div>
        )}

        {/* 시설 상세 패널 */}
        {selectedLibrary && (
          <div className="absolute inset-0 z-20">
            <LibraryDetail library={selectedLibrary} bookTitle={title} onClose={() => setSelectedLibrary(null)} />
          </div>
        )}
      </div>
    </main>
  );
}