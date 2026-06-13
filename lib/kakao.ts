"use client";

import { useEffect, useRef, useState } from "react";

const KAKAO_SDK_URL = "//dapi.kakao.com/v2/maps/sdk.js?appkey=";

type UseKakaoMapOptions = {
  center: { lat: number; lng: number };
  level?: number;
};

export function useKakaoMap(
  containerRef: React.RefObject<HTMLDivElement>,
  options: UseKakaoMapOptions
) {
  const mapRef = useRef<KakaoMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey || !containerRef.current) return;

    function initMap() {
      if (!containerRef.current) return;
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(options.center.lat, options.center.lng),
        level: options.level ?? 5,
      });
      mapRef.current = map;
      setReady(true);
    }

    // 이미 로드된 경우
    if (window.kakao?.maps) {
      initMap();
      return;
    }

    // SDK 동적 로드
    const script = document.createElement("script");
    script.src = `${KAKAO_SDK_URL}${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(initMap);
    };
    document.head.appendChild(script);

    return () => {
      // cleanup: 마커 정리는 각 컴포넌트에서
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { map: mapRef.current, ready };
}
