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


type MapPageProps = { params: { isbn: string }; searchParams: { title?: string } };

const FEATURES = [
  "다른 구 도서관에서도 찾고 싶어요.(기타 의견으로 어딘지 알려주세요!)",
  "저자 이름으로도 검색하고 싶어요.",
  "여러 책을 한꺼번에 검색하고 싶어요.",
  "전자책으로 먼저 읽을 수 있는지 확인하고 싶어요.",
];

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwckk8L6aKOx4Cs9hj0i5P1tPpW_K298AIq6GXBMrX2jUnm9LrL9AX9bQ3tFveqbDv5/exec";

function FeedbackOptions({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [etcText, setEtcText] = useState("");
  const [etcSelected, setEtcSelected] = useState(false);

  function toggle(f: string) {
    setSelected(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  async function handleSubmit() {
    if (selected.length === 0 && !etcSelected) return;
    setSending(true);
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: [...selected, ...(etcSelected && etcText.trim() ? [`기타: ${etcText.trim()}`] : [])].join(", ") }),
      });
    } finally {
      setSubmitted(true);
      setSending(false);
      setTimeout(onClose, 1500);
    }
  }

  if (submitted) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-2xl mb-2">🎉</p>
        <p className="font-medium text-gray-800">감사해요!</p>
        <p className="text-xs text-gray-400 mt-1">소중한 의견을 반영할게요.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-4">
      <p className="text-xs text-gray-400 mb-3">여러 개 골라도 돼요!</p>
      <div className="space-y-2 mb-4">
        {FEATURES.map((f) => {
          const isSelected = selected.includes(f);
          return (
            <button
              key={f}
              onClick={() => toggle(f)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm"
              style={{
                borderColor: isSelected ? "#2563eb" : "#e5e7eb",
                background: isSelected ? "#eff6ff" : "white",
                color: isSelected ? "#1d4ed8" : "#374151",
              }}
            >
              <div style={{
                width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
                border: isSelected ? "none" : "1.5px solid #d1d5db",
                background: isSelected ? "#2563eb" : "white",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isSelected && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              {f}
            </button>
          );
        })}

        {/* 기타 선택지 */}
        <button
          onClick={() => setEtcSelected(prev => !prev)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm"
          style={{
            borderColor: etcSelected ? "#2563eb" : "#e5e7eb",
            background: etcSelected ? "#eff6ff" : "white",
            color: etcSelected ? "#1d4ed8" : "#374151",
          }}
        >
          <div style={{
            width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
            border: etcSelected ? "none" : "1.5px solid #d1d5db",
            background: etcSelected ? "#2563eb" : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {etcSelected && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          기타 (직접 알려주세요)
        </button>

        {etcSelected && (
          <textarea
            value={etcText}
            onChange={e => setEtcText(e.target.value)}
            placeholder="자유롭게 적어주세요!"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400"
            rows={3}
          />
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={(selected.length === 0 && !etcSelected) || (etcSelected && etcText.trim() === "" && selected.length === 0) || sending}
        className="w-full py-3.5 rounded-xl text-white text-sm font-medium"
        style={{ background: (selected.length > 0 || (etcSelected && etcText.trim())) ? "#2563eb" : "#d1d5db" }}
      >
        {sending ? "전송 중..." : "보내기"}
      </button>
    </div>
  );
}
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [showRegionNotice, setShowRegionNotice] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);


  
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
      .then((coords) => {
        const lat = coords.latitude;
        const lng = coords.longitude;
        setUserLocation({ lat, lng });

        // 동작구 중심과의 거리 계산 (단순 위경도 차이)
        const dlat = lat - 37.4967;
        const dlng = lng - 126.9508;
        const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111;
        if (distKm > 5) {
          setShowRegionNotice(true);
          setTimeout(() => setShowRegionNotice(false), 3000);
        }
      })
      .catch((err) => console.warn("위치 오류:", err.message));
  }, []);

  useEffect(() => {
    const intervalRef = { current: null as ReturnType<typeof setInterval> | null };
    const initial = setTimeout(() => {
      setShowFeedback(true);
      intervalRef.current = setInterval(() => {
        setShowFeedback(prev => !prev);
      }, 30000);
    }, 30000);
    return () => {
      clearTimeout(initial);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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
    if (!mapReady || loading || !mapContainerRef.current || mapRef.current) return;
    const dlat = userLocation ? userLocation.lat - 37.4967 : 0;
    const dlng = userLocation ? userLocation.lng - 126.9508 : 0;
    const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111;
    const isFar = distKm > 5;
    const center = userLocation && !isFar
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(37.4967, 126.9508);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, { center, level: 5 });
  }, [mapReady, userLocation, loading]);
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDesktop(!isMobile);
  }, []);

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
          <div className="absolute right-3 z-10" style={{ bottom: isDesktop ? "1.5rem" : "7rem" }}>
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

        {/* 하단 중앙: 말풍선 안내 / 피드백 버튼 교차 */}
        {!loading && mapReady && !selectedLibrary && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 text-white text-xs px-5 py-2.5 rounded-full whitespace-nowrap cursor-pointer"
            style={{ bottom: isDesktop ? "0.75rem" : "7rem", background: showFeedback ? "#2563eb" : "rgba(31,41,55,0.85)" }}
            onClick={() => { if (showFeedback) setShowFeedbackSheet(true); }}
          >
            {showFeedback ? "다음 기능은? →" : "지도를 움직여 대출 가능한 도서를 찾아보세요!"}
          </div>
        )}

        {/* 피드백 바텀시트 */}
        {showFeedbackSheet && (
          <div className="absolute inset-0 z-30" onClick={() => setShowFeedbackSheet(false)}>
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pb-8" onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 pt-2 pb-4">
                <p className="font-bold text-gray-900 text-base">다음에 어떤 기능이 생기면 좋을까요?</p>
                <button onClick={() => setShowFeedbackSheet(false)} className="text-gray-400 p-1">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <FeedbackOptions onClose={() => setShowFeedbackSheet(false)} />
              <div className="px-5 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-300 leading-relaxed">
                  지금빌려는 개인 프로젝트로, 현재 동작구 도서관만 지원해요.<br />
                  서울시교육청 동작도서관(djlib.sen.go.kr)은 현재 미지원이에요.<br />
                  실제 대출가능 여부는 도서관 홈페이지에서 확인해 주세요.<br />
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* 지역 안내 말풍선 */}
        {showRegionNotice && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-gray-800 bg-opacity-90 text-white text-sm px-6 py-3 rounded-full whitespace-nowrap animate-pulse">
            현재는 동작구에서만 이용 가능합니다.
          </div>
        )}

        {/* 시설 상세 패널 */}
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