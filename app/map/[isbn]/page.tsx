"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary, Availability, ApiResponse } from "@/types";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { getCurrentPosition } from "@/lib/distance";

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
  return "#2563eb";
}

const SHORT_NAMES: Record<string, string> = {
  "김영삼도서관": "김영삼", "까망돌도서관": "까망돌", "사당솔밭도서관": "사당솔밭",
  "신대방누리도서관": "신대방누리", "동작영어마루도서관": "동작영어마루", "약수도서관": "약수",
  "동작샘터도서관": "동작샘터", "대방어린이도서관": "대방어린이", "다울작은도서관": "다울",
  "국사봉숲속작은도서관": "국사봉", "노량진1동 작은도서관": "노량진1동", "노량진2동 작은도서관": "노량진2동",
  "대방동 작은도서관": "대방동", "사당1동 작은도서관": "사당1동", "사당2동 작은도서관": "사당2동",
  "사당3동 작은도서관": "사당3동", "사당5동 작은도서관": "사당5동", "상도1동 작은도서관": "상도1동",
  "상도2동 작은도서관": "상도2동", "상도3동 작은도서관": "상도3동", "상도4동 작은도서관": "상도4동",
  "신대방2동 작은도서관": "신대방2동", "흑석동 작은도서관": "흑석동", "담소작은도서관": "담소",
  "상도중앙작은도서관": "상도중앙", "성대골 어린이도서관": "성대골어린이", "아트&힐링작은도서관": "아트&힐링",
  "지혜샘터작은도서관": "지혜샘터", "행복한래미안작은도서관": "행복한래미안", "양문작은도서관": "양문",
  "만나작은도서관": "만나", "장승배기역 스마트도서관": "장승배기역",
  "신대방삼거리역 스마트도서관": "신대방삼거리역", "총신대입구(이수역) 스마트도서관": "총신대입구(이수역)",
  "노들역 스마트도서관": "노들역", "까망돌 스마트도서관": "까망돌S", "동작구민체육센터 스마트도서관": "동작구민체육센터",
};
function getLibraryShortName(name: string): string { return SHORT_NAMES[name] ?? name; }

function createCustomOverlay(lib: PhysicalLibrary, onClick: () => void) {
  const color = getMarkerColor(lib);
  const shortName = getLibraryShortName(lib.libraryName);
  const count = (lib as any).availableCount ?? (lib.available ? 1 : 0);
  const div = document.createElement("div");
  div.style.cssText = `background:${color};color:white;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:500;text-align:center;cursor:pointer;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);line-height:1.4;`;
  div.innerHTML = `${shortName}<br><span style="font-size:11px;opacity:0.9;">${count}권</span>`;
  div.addEventListener("click", onClick);
  return div;
}

const LEGEND = [
  { label: "구립", color: "#2563eb" },
  { label: "작은", color: "#16a34a" },
  { label: "스마트", color: "#7c3aed" },
];

const BOTTOM_STYLE = { bottom: "max(1.5rem, calc(0.75rem + env(safe-area-inset-bottom)))" };

type MapPageProps = { params: { isbn: string }; searchParams: { title?: string } };

export default function MapPage({ params, searchParams }: MapPageProps) {
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
  const [loadingMessage, setLoadingMessage] = useState("구립도서관 찾는 중...");
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const messages = [
      { text: "구립도서관 찾는 중...", delay: 0 },
      { text: "작은도서관 찾는 중...", delay: 3000 },
      { text: "스마트도서관 찾는 중...", delay: 6000 },
    ];
    const timers = messages.map(({ text, delay }) => setTimeout(() => setLoadingMessage(text), delay));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

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

  useEffect(() => {
    getCurrentPosition()
      .then((coords) => setUserLocation({ lat: coords.latitude, lng: coords.longitude }))
      .catch((err) => console.warn("위치 오류:", err.message));
  }, []);

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

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const center = userLocation
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(37.4967, 126.9508);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, { center, level: 5 });
  }, [mapReady, userLocation]);

  const updateVisibleCount = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const bounds = map.getBounds();
    const count = libraries.filter((lib) => {
      if (!lib.available) return false;
      return bounds.contain(new window.kakao.maps.LatLng(lib.latitude, lib.longitude));
    }).length;
    setVisibleAvailableCount(count);
  }, [libraries]);

  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    libraries.forEach((lib) => {
      const content = createCustomOverlay(lib, () => setSelectedLibrary({ ...lib }));
      const overlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
        content, yAnchor: 1.3, map,
      });
      overlaysRef.current.push(overlay);
    });
    if (userLocation) {
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      const dot = document.createElement("div");
      dot.style.cssText = `width:12px;height:12px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.25);`;
      const userOverlay = new (window.kakao.maps as any).CustomOverlay({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        content: dot, yAnchor: 0.5, map,
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
              <div key={label} style={{ background: color, color: "white", borderRadius: "10px", padding: "3px 10px", fontSize: "12px", fontWeight: 500, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-gray-500" aria-label="뒤로가기">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 text-sm line-clamp-1">{title ?? "도서관 찾기"}</h1>
            <p className="text-xs text-gray-400">동작구 · ISBN {isbn}</p>
          </div>
        </div>
      </header>

      {/* 지도 영역 */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* 로딩 오버레이 */}
        {(loading || !mapReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-lg">
              <LoadingDots message={mapReady ? loadingMessage : "지도를 불러오는 중..."} />
            </div>
          </div>
        )}

        {/* 좌상단: 대출 가능 권수 */}
        {!loading && mapReady && (
          <div className="absolute top-3 left-3 z-10 bg-white rounded-2xl px-4 py-2 shadow text-xs font-medium text-gray-800">
            지금 여기에서 바로 대출 가능한 도서 <span className="text-blue-600 font-bold">{visibleAvailableCount}</span>권
          </div>
        )}

        {/* 우하단: 현재위치 버튼 */}
        {!selectedLibrary && (
          <div className="absolute right-3 z-10" style={BOTTOM_STYLE}>
            <button
              onClick={userLocation ? moveToUser : undefined}
              className={`bg-white shadow rounded-xl p-2.5 ${!userLocation ? "opacity-50 cursor-default" : "cursor-pointer"}`}
              aria-label={userLocation ? "현재 위치로 이동" : "위치 정보 없음"}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="3" fill={userLocation ? "#2563eb" : "#9ca3af"} />
                <circle cx="10" cy="10" r="7" stroke={userLocation ? "#2563eb" : "#9ca3af"} strokeWidth="1.5" />
                <path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke={userLocation ? "#2563eb" : "#9ca3af"} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {!userLocation && (
              <div style={{ position: "absolute", top: "-4px", right: "-4px", width: "16px", height: "16px", background: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* 하단 중앙: 말풍선 안내 */}
        {!loading && mapReady && !selectedLibrary && (
          <div className="absolute left-1/2 -translate-x-1/2 z-10 bg-gray-800 bg-opacity-85 text-white text-xs px-5 py-2.5 rounded-full whitespace-nowrap" style={BOTTOM_STYLE}>
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