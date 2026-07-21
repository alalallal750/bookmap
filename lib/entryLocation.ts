/**
 * [2026-07-22 신규 — 진입 구조(핸드오프 v3 20장)] 루트(`/`) 진입 시 현재 위치로
 * 서울/서울외를 갈라 A-B(`/ebook`) vs C(`/nationwide`)로 보내기 위한 공용 헬퍼.
 *
 * 단일 도메인(caniread.vercel.app) 원칙(핸드오프 v3 점1) — 사용자는 항상 루트로
 * 진입하고, 루트가 위치로 분기한다. 위치 실패/거부/미지원은 전부 "위치 없음"으로
 * 취급해 기본 A-B(`/ebook`)로 보내고, `/ebook`이 배너로 C 이동을 유도한다.
 *
 * 재시도 어포던스(20장 A안 보완): 브라우저는 한 번 '거부'하면 재요청 팝업을 안
 * 띄우므로(즉시 실패 콜백), 앱은 재요청을 강제할 수 없다. `/ebook`의 "내 위치로
 * 찾기" 버튼이 이 헬퍼로 재측정하고, 거부 상태면 브라우저 설정 안내로 갈음한다.
 */

import { getNearbyUnits } from "@/lib/data/searchUnits";

export type EntryClass = "seoul" | "outside" | "none";

/** 좌표 → 서울(11)/서울외/판정불가 분류. 전국판(18-1)과 동일한 최근접 시군구 방식. */
export function classifyByCoords(lat: number, lng: number): EntryClass {
  const nearby = getNearbyUnits(lat, lng, 1);
  if (!nearby || nearby.length === 0) return "none";
  return nearby[0].region === "11" ? "seoul" : "outside";
}

/** 분류 결과에 대응하는 진입 라우트. 위치 없음은 A-B + 배너(loc=none). */
export function routeForClass(cls: EntryClass): string {
  if (cls === "seoul") return "/ebook";
  if (cls === "outside") return "/nationwide";
  return "/ebook?loc=none";
}

/**
 * 위치를 1회 측정. 성공 시 좌표, 실패 시 reject(GeolocationPositionError 또는 Error).
 * enableHighAccuracy=false — 구/시도 판정에는 저정밀로 충분하고 빠름.
 */
export function getPositionOnce(timeoutMs = 5000): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation-unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 }
    );
  });
}

/**
 * 위치 권한 상태를 조용히 조회(팝업 없음). Permissions API 미지원 브라우저는
 * undefined. "거부됨"을 구분해 재시도 버튼이 설정 안내로 갈음하게 하는 데 쓴다.
 */
export async function queryGeolocationPermission(): Promise<
  PermissionState | undefined
> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions) return undefined;
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state;
  } catch {
    return undefined;
  }
}
