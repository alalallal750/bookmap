"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PhysicalLibrary, Availability, ApiResponse } from "@/types";
import { LibraryDetail } from "@/components/map/LibraryDetail";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getCurrentPosition, sortByDistance, formatDistance } from "@/lib/distance";

function markerSvg(color: string, label?: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.059 27.941 0 18 0z" fill="${color}"/>
      <circle cx="18" cy="18" r="9" fill="white"/>
      ${label ? `<text x="18" y="22" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold">${label}</text>` : ""}
    </svg>`
  )}`;
}

const MARKERS = {
  available: markerSvg("#16a34a"),
  unavailable: markerSvg("#dc2626"),
  smart: markerSvg("#7c3aed", "S"),
  user: markerSvg("#2563eb"),
};

type MapPageProps = {
  params: { isbn: string };
  searchParams: { title?: string };
};

export default function MapPage({ params, searchParams }: MapPageProps) {
  const { isbn } = params;
  const title = searchParams?.title;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);

  const [libraries, setLibraries] = useState<PhysicalLibrary[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PhysicalLibrary | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("구립도서관 찾는 중...");

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
  const [locationError, setLocationError] = useState<string | null>(null);

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
      .catch((err) => {
        setLocationError(err.message);
      });
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
    script.onload = () => {
      window.kakao.maps.load(() => setMapReady(true));
    };
    document.head.appendChild(script);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;

    const center = userLocation
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(37.4967, 126.9508);

    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center,
      level: 5,
    });
  }, [mapReady, userLocation]);

  // 마커 렌더링
  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const size = new window.kakao.maps.Size(36, 44);
    const sorted = userLocation
      ? sortByDistance(libraries, userLocation.lat, userLocation.lng)
      : libraries;

    sorted.forEach((lib) => {
      const imgSrc =
        lib.libraryType === "smart_library"
          ? MARKERS.smart
          : lib.available
          ? MARKERS.available
          : MARKERS.unavailable;

      const image = new window.kakao.maps.MarkerImage(imgSrc, size);
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
        map,
        image,
        title: lib.libraryName,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        setSelectedLibrary({ ...lib });
      });

      markersRef.current.push(marker);
    });

    if (userLocation) {
      const userImg = new window.kakao.maps.MarkerImage(MARKERS.user, size);
      const userMarker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        map,
        image: userImg,
        title: "내 위치",
      });
      markersRef.current.push(userMarker);
    }
  }, [libraries, userLocation]);

  useEffect(() => {
    if (mapRef.current) drawMarkers();
  }, [drawMarkers, mapReady]);

  function moveToUser() {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.setCenter(
      new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
    );
    mapRef.current.setLevel(4);
  }

  const sortedLibraries = userLocation
    ? sortByDistance(libraries, userLocation.lat, userLocation.lng)
    : libraries;


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
            <h1 className="font-bold text-gray-900 text-sm line-clamp-1">
              {title ?? "도서관 찾기"}
            </h1>
            <p className="text-xs text-gray-400">동작구 · ISBN {isbn}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 relative">
        {!mapReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <LoadingSpinner message="지도를 불러오는 중..." />
          </div>
        ) : (
          <div ref={mapContainerRef} className="absolute inset-0" />
        )}

        {/* 범례 */}
        <div className="absolute top-3 left-3 bg-white rounded-xl shadow px-3 py-2 z-10 text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" />
            <span className="text-gray-600">대출가능</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="text-gray-600">대출중</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
            <span className="text-gray-600">스마트</span>
          </div>
        </div>

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

        {locationError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-700 max-w-[260px] text-center">
            위치 사용 불가 · 거리 표시 안 됨
          </div>
        )}
{/* 검색 로딩 */}
{loading && (
  <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl px-4 py-6">
    <LoadingSpinner message={loadingMessage} />
  </div>
)}
        {/* 하단 도서관 목록 */}
        {!selectedLibrary && !loading && sortedLibraries.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[45vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-4 pb-4 space-y-2">
              {sortedLibraries.map((lib) => (
                <button key={lib.id} onClick={() => setSelectedLibrary(lib)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 text-left active:bg-gray-50">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    lib.libraryType === "smart_library" ? "bg-purple-600" : lib.available ? "bg-green-600" : "bg-red-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{lib.libraryName}</p>
                    <p className="text-xs text-gray-400 truncate">{lib.address}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {lib.distance !== undefined && (
                      <p className="text-xs text-gray-500">{formatDistance(lib.distance)}</p>
                    )}
                    <p className={`text-xs font-medium ${lib.available ? "text-green-600" : "text-red-500"}`}>
                      {lib.available ? "대출가능" : "대출중"}
                      {(lib as any).copyInfo && <span className="ml-0.5 opacity-75">({(lib as any).copyInfo})</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
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
