"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary, PhysicalBook, ApiResponse } from "@/types";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { DEFAULT_LOCATION } from "@/lib/data/districtCoords";

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

function getMarkerColor(lib: PhysicalLibrary): string {
  if (!lib.available) return "#888780";
  if (lib.libraryType === "smart_library") return "#7c3aed";
  if (lib.libraryType === "small_library") return "#16a34a";
  if (lib.libraryType === "edu_library") return "#ea580c";
  return "#2563eb";
}

function createCustomOverlay(lib: PhysicalLibrary, onClick: () => void) {
  const color = getMarkerColor(lib);
  const count = (lib as any).availableCount ?? (lib.available ? 1 : 0);
  const div = document.createElement("div");
  div.style.cssText = `background:${color};color:white;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:500;text-align:center;cursor:pointer;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);line-height:1.4;`;
  div.innerHTML = `${lib.libraryName}<br><span style="font-size:11px;opacity:0.9;">${count}권</span>`;
  div.addEventListener("click", onClick);
  return div;
}

const LEGEND = [
  { label: "구립", color: "#2563eb" },
  { label: "작은", color: "#16a34a" },
  { label: "스마트", color: "#7c3aed" },
  { label: "교육청", color: "#ea580c" },
];

type MapPageProps = { params: { isbn: string }; searchParams: { title?: string } };

export default function PhysicalMapPage({ params, searchParams }: MapPageProps) {
  const { isbn } = params;
  const title = searchParams?.title;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);

  const [libraries, setLibraries] = useState<PhysicalLibrary[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PhysicalLibrary | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("도서관 찾는 중...");
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  // 로딩 메시지 순차 변경
  useEffect(() => {
    if (!loading) return;
    const messages = [
      { text: "도서관 찾는 중...", delay: 0 },
      { text: "작은도서관·스마트도서관 확인 중...", delay: 3000 },
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

  // 도서관 가용성 로드 — title로 재검색해서 해당 ISBN의 도서관 목록만 추출
  useEffect(() => {
    async function load() {
      try {
        const url = new URL("/api/physical-search", window.location.origin);
        url.searchParams.set("q", title ?? isbn);
        const lat = userLocation?.lat ?? DEFAULT_LOCATION.lat;
        const lng = userLocation?.lng ?? DEFAULT_LOCATION.lng;
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lng", String(lng));

        const res = await fetch(url.toString());
        const json: ApiResponse<PhysicalBook[]> = await res.json();
        if (!json.success) return;

        const matched = json.data.find((b) => b.isbn === isbn);
        setLibraries(matched?.libraries ?? []);
      } finally {
        setLoading(false);
      }
    }
    // userLocation이 null이어도(권한 거부) DEFAULT_LOCATION으로 진행
    load();
  }, [isbn, title, userLocation]);

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

    if (userLocation) {
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      const dot = document.createElement("div");
      dot.style.cssText = `width:12px;height:12px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.25);`;
      const userOverlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        content: dot,
        yAnchor: 0.5,
        map,
      });
      userMarkerRef.current = userOverlay;
      overlaysRef.current.push(userOverlay);
    }

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
          <Link href="/physical" className="p-2 -ml-2 text-gray-500" aria-label="뒤로가기">
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

        {!loading && mapReady && (
          <div className="absolute top-3 left-3 z-10 bg-white rounded-2xl px-4 py-2 shadow text-xs font-medium text-gray-800">
            지금 여기에서 바로 대출 가능한 도서{" "}
            <span className="text-blue-600 font-bold">{visibleAvailableCount}</span>권
          </div>
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