"use client";

import { useEffect, useRef, useCallback } from "react";
import { PhysicalLibrary } from "@/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type KakaoMapProps = {
  libraries: PhysicalLibrary[];
  userLocation: { lat: number; lng: number } | null;
  onMarkerClick: (library: PhysicalLibrary) => void;
  isReady: boolean;
};

// 마커 색상 SVG (데이터 URI)
function makeMarkerSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/>
    <circle cx="16" cy="16" r="7" fill="white"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeSmartMarkerSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="#7c3aed"/>
    <text x="16" y="21" text-anchor="middle" fill="white" font-size="12" font-weight="bold">S</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MARKER_AVAILABLE = makeMarkerSvg("#16a34a");
const MARKER_UNAVAILABLE = makeMarkerSvg("#dc2626");
const MARKER_SMART = makeSmartMarkerSvg();
const MARKER_USER = makeMarkerSvg("#2563eb");

export function KakaoMap({ libraries, userLocation, onMarkerClick, isReady }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);

  // 지도 초기화
  useEffect(() => {
    if (!isReady || !containerRef.current) return;
    if (!window.kakao?.maps) return;

    const center = userLocation
      ? new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.kakao.maps.LatLng(37.4967, 126.9508); // 동작구 기본 중심

    const map = new window.kakao.maps.Map(containerRef.current, {
      center,
      level: 5,
    });
    mapInstanceRef.current = map;
  }, [isReady, userLocation]);

  // 마커 그리기
  const drawMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const markerSize = new window.kakao.maps.Size(32, 40);

    // 도서관 마커
    libraries.forEach((lib) => {
      const imgSrc =
        lib.libraryType === "smart_library"
          ? MARKER_SMART
          : lib.available
          ? MARKER_AVAILABLE
          : MARKER_UNAVAILABLE;

      const markerImage = new window.kakao.maps.MarkerImage(imgSrc, markerSize);
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(lib.latitude, lib.longitude),
        map,
        image: markerImage,
        title: lib.libraryName,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        onMarkerClick(lib);
      });

      markersRef.current.push(marker);
    });

    // 사용자 위치 마커
    if (userLocation) {
      const userImage = new window.kakao.maps.MarkerImage(MARKER_USER, markerSize);
      const userMarker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        map,
        image: userImage,
        title: "내 위치",
      });
      markersRef.current.push(userMarker);
    }
  }, [libraries, userLocation, onMarkerClick]);

  useEffect(() => {
    if (mapInstanceRef.current) drawMarkers();
  }, [drawMarkers]);

  if (!isReady) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <LoadingSpinner message="지도를 불러오는 중..." />
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
