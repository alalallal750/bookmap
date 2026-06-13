// 카카오맵 JavaScript SDK 타입 선언
// 전체 타입은 @types/kakao.maps.d.ts 사용 또는 아래 최소 선언으로 대체

declare global {
  interface Window {
    kakao: KakaoMaps;
  }

  interface KakaoMaps {
    maps: {
      Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
      Marker: new (options: KakaoMarkerOptions) => KakaoMarker;
      MarkerImage: new (
        src: string,
        size: KakaoSize,
        options?: { offset?: KakaoPoint }
      ) => KakaoMarkerImage;
      InfoWindow: new (options: KakaoInfoWindowOptions) => KakaoInfoWindow;
      LatLng: new (lat: number, lng: number) => KakaoLatLng;
      Size: new (width: number, height: number) => KakaoSize;
      Point: new (x: number, y: number) => KakaoPoint;
      event: {
        addListener: (
          target: object,
          type: string,
          handler: (...args: unknown[]) => void
        ) => void;
      };
      load: (callback: () => void) => void;
    };
  }

  interface KakaoMapOptions {
    center: KakaoLatLng;
    level: number;
  }

  interface KakaoMap {
    setCenter(latlng: KakaoLatLng): void;
    setLevel(level: number): void;
    panTo(latlng: KakaoLatLng): void;
  }

  interface KakaoMarkerOptions {
    position: KakaoLatLng;
    map?: KakaoMap;
    image?: KakaoMarkerImage;
    title?: string;
  }

  interface KakaoMarker {
    setMap(map: KakaoMap | null): void;
    getPosition(): KakaoLatLng;
  }

  interface KakaoMarkerImage {}

  interface KakaoInfoWindowOptions {
    content: string;
    removable?: boolean;
  }

  interface KakaoInfoWindow {
    open(map: KakaoMap, marker: KakaoMarker): void;
    close(): void;
  }

  interface KakaoLatLng {
    getLat(): number;
    getLng(): number;
  }

  interface KakaoSize {
    width: number;
    height: number;
  }

  interface KakaoPoint {
    x: number;
    y: number;
  }
}

export {};
