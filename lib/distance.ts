/**
 * 하버사인 공식으로 두 좌표 간 거리(km) 계산
 * 클라이언트에서 현재 위치 기준 정렬에 사용
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // 지구 반지름 (km)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** km → 표시용 문자열 (예: 0.3km, 1.2km) */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/**
 * 도서관 배열을 현재 위치 기준으로 정렬하고 distance 필드를 채움
 */
export function sortByDistance<T extends { latitude: number; longitude: number; distance?: number }>(
  items: T[],
  userLat: number,
  userLng: number
): T[] {
  return items
    .map((item) => ({
      ...item,
      distance: calculateDistance(userLat, userLng, item.latitude, item.longitude),
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

/**
 * 모바일 브라우저에서 위치 권한 요청
 * - iOS Safari / Android Chrome 모두 지원
 * - 타임아웃 10초
 */
export function getCurrentPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 서비스를 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new Error("위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요."));
            break;
          case err.POSITION_UNAVAILABLE:
            reject(new Error("현재 위치를 확인할 수 없습니다."));
            break;
          case err.TIMEOUT:
            reject(new Error("위치 요청 시간이 초과되었습니다."));
            break;
          default:
            reject(new Error("위치를 가져오는 중 오류가 발생했습니다."));
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000, // 5분 캐시
      }
    );
  });
}
