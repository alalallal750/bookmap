/**
 * 서울 25개 구 — 종이책 검색용 dbnum + 대표좌표
 *
 * dbnum: 서울도서관 통합검색(meta.seoul.go.kr/libseoul)에 "이 구 도서관들을
 *        검색대상으로 넣어라"고 알려주는 코드. 위경도 정보는 없음.
 *        (caniread 핸드오프 ver2 문서 3-2장 표 그대로)
 *
 * lat/lng: "사용자 위치 반경 5km 안에 이 구가 들어오는지" 판단할 때 쓰는
 *          대표좌표. 그 구의 대표 도서관 위치를 카카오 Geocoding API로
 *          조회한 값(get-coords.js 실행 결과, 2026-06-23).
 *          정밀한 행정구역 경계가 아니라 "대략 가까운 구를 잡아내는" 용도로만
 *          쓰이므로, 구청이 아닌 대표 도서관 좌표를 그대로 사용함.
 */

export type District = {
  gu: string;
  dbnum: string;
  lat: number;
  lng: number;
};

export const DISTRICTS: District[] = [
  { gu: "동작구", dbnum: "43641", lat: 37.48403213246281, lng: 126.96735910708873 },
  { gu: "관악구", dbnum: "42921", lat: 37.46705411409455, lng: 126.94476867051847 },
  { gu: "중랑구", dbnum: "99071", lat: 37.61524044821545, lng: 127.0869527012108 },
  { gu: "용산구", dbnum: "88341", lat: 37.5390036092211, lng: 126.965258884714 },
  { gu: "광진구", dbnum: "19071", lat: 37.55106994644599, lng: 127.11060915357692 },
  { gu: "동대문구", dbnum: "68831", lat: 37.5898911041047, lng: 127.047328254504 },
  { gu: "도봉구", dbnum: "43361", lat: 37.6445499352563, lng: 127.043999919307 },
  { gu: "노원구", dbnum: "43081", lat: 37.66106965639641, lng: 127.06500809784696 },
  { gu: "성동구", dbnum: "34141", lat: 37.55918951636491, lng: 127.03496099832289 },
  { gu: "은평구", dbnum: "33451", lat: 37.619049316454, lng: 126.928381841584 },
  { gu: "송파구", dbnum: "44381", lat: 37.49498961772475, lng: 127.11547599284663 },
  { gu: "종로구", dbnum: "88361", lat: 37.5904038281362, lng: 126.96590530631 },
  { gu: "중구", dbnum: "44701", lat: 37.55636596450095, lng: 127.0108387456178 },
  { gu: "구로구", dbnum: "42331", lat: 37.48906560958533, lng: 126.85890398698226 },
  { gu: "강북구", dbnum: "88351", lat: 37.62489854721974, lng: 127.03601125702522 },
  { gu: "강동구", dbnum: "21841", lat: 37.5650447488513, lng: 127.17388820169033 },
  { gu: "서초구", dbnum: "88431", lat: 37.5024886017556, lng: 127.012544317106 },
  { gu: "양천구", dbnum: "44451", lat: 37.508766650295534, lng: 126.86715169067735 },
  { gu: "금천구", dbnum: "107191", lat: 37.45646657552785, lng: 126.89573760091004 },
  { gu: "강남구", dbnum: "50421", lat: 37.4881641147195, lng: 127.038742912705 },
  { gu: "강서구", dbnum: "42871", lat: 37.5594278014627, lng: 126.865302989472 },
  { gu: "성북구", dbnum: "44301", lat: 37.6049723386975, lng: 127.050599359915 },
  { gu: "마포구", dbnum: "88421", lat: 37.56373600080743, lng: 126.90811569951101 },
  { gu: "서대문구", dbnum: "43921", lat: 37.572954443895654, lng: 126.95554868549858 },
  { gu: "영등포구", dbnum: "88631", lat: 37.5216797272756, lng: 126.920048533997 },
];

/**
 * [2026-06-26 임시] 3순위 구(송파구·성북구 — ISBN 필드도 url도 없어
 * 제목+저자 합류에만 의존하는 구)를 검색에서 임시 제외. 1·2순위
 * 23개 구만으로 ISBN 검색 로직이 정상 동작하는지 노이즈 없이
 * 검증하기 위한 목적. 검증 끝나면 이 선언과 아래 두 함수의 .filter()를
 * 제거하고 원래대로 복원할 것.
 */
const TEMP_EXCLUDED_DBNUMS = new Set(["44381", "44301"]); // 송파구, 성북구

/**
 * 위치 정보가 없을 때 기본값 — 서울방배경찰서 (동작구/서초구 경계,
 * 동작대로 인근). [2026-06-23 결정]
 */
export const DEFAULT_LOCATION = { lat: 37.4922364, lng: 126.9876359 };

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 두 좌표 사이의 실제 거리(km) — Haversine 공식.
 * districtCoords.ts 안의 단순 위경도 차이 근사(* 111) 대신, 정확한 구면거리
 * 계산을 사용함. 위도가 올라갈수록(서울처럼 위도 37도 부근) 경도 1도의
 * 실제 거리가 줄어드는데, 단순 근사는 이를 반영하지 못해 동서 방향 거리를
 * 과대평가하는 오차가 있음 — 자릿수상 큰 차이는 아니지만, 5km라는 좁은
 * 반경을 기준으로 구를 가르는 작업이라 정확한 공식을 쓰는 쪽을 택함.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

const NEARBY_RADIUS_KM = 5;

/**
 * 사용자 위치 기준 반경 5km 안에 대표좌표가 있는 구들의 dbnum 목록을 반환.
 * 하나도 안 걸리면(외곽지역 등) 가장 가까운 구 1곳을 fallback으로 포함—
 * "검색대상 구가 0개"인 상황을 방지.
 */
export function getNearbyDbnums(lat: number, lng: number): string[] {
  const withDistance = DISTRICTS
    .filter((d) => !TEMP_EXCLUDED_DBNUMS.has(d.dbnum)) // [2026-06-26 임시] 3순위 구 제외
    .map((d) => ({
      ...d,
      distance: distanceKm(lat, lng, d.lat, d.lng),
    }));

  const within = withDistance.filter((d) => d.distance <= NEARBY_RADIUS_KM);
  if (within.length > 0) {
    return within.map((d) => d.dbnum);
  }

  const closest = withDistance.sort((a, b) => a.distance - b.distance)[0];
  return closest ? [closest.dbnum] : [];
}

/**
 * [2026-06-24 추가] 위치 정보가 없는 사용자를 위한 전체 구 dbnum 목록.
 * 기존엔 위치가 없으면 DEFAULT_LOCATION(서울방배경찰서 인근)을 그냥
 * 대신 써서, "위치 없음"과 "방배경찰서 근처에 있음"이 코드상 구분되지
 * 않았음 — 그러면 위치가 멀어서 검색 대상에서 빠진 구에 있는 책은
 * 사용자에게 "검색결과 없음"으로 잘못 보였을 수 있음(2026-06-24 논의).
 * 위치가 없으면 좁혀서 추측하는 대신 25개 구 전부를 검색해, 놓치는
 * 책이 없도록 함.
 *
 * [2026-06-26 임시] 3순위 구(송파구·성북구)도 같은 이유로 제외.
 */
export function getAllDbnums(): string[] {
  return DISTRICTS.map((d) => d.dbnum).filter((dbnum) => !TEMP_EXCLUDED_DBNUMS.has(dbnum));
}

/** dbnum → 구 이름 역조회 (화면 표시용) */
export function getDistrictName(dbnum: string): string | undefined {
  return DISTRICTS.find((d) => d.dbnum === dbnum)?.gu;
}