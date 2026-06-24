/**
 * lib/data/branchCoords.ts
 *
 * data/branch-coords.json (get-branch-coords.js 실행 결과 원본, 519건
 * matched + 23건 mismatched + 20건 notFound)을 읽어서, 분관 이름으로
 * 좌표를 조회할 수 있는 형태로 가공.
 *
 * [2026-06-23] 숫자(위도/경도)를 손으로 옮겨적다 실수할 위험을 피하기
 * 위해, 원본 JSON 파일을 그대로 데이터 소스로 쓰고 이 코드에서 가공만
 * 수행함. 좌표 자체는 절대 이 파일에 직접 적지 않음.
 *
 * 처리 단계:
 *   1. mismatched 배열(23건) 전체 제외 — 동명이인 사고 등으로 이미
 *      "구 이름이 주소에 없다"고 자동 검증에서 걸러진 것들.
 *   2. matched 안에 있지만 추가 수동 검증으로 발견된 위험 항목 8건 제외
 *      (아래 SUSPICIOUS_KEYWORDS 참조) — searchKeyword와 matchedName이
 *      서로 다른 시설을 가리키는데도 자동 검증(구 이름 포함 여부)은
 *      통과해버린 사고들. 검증 안 된 채로 코드에 들어가면 위험하므로
 *      이름이 다시 확인되기 전까지 좌표 없음 처리.
 */

import fs from "fs";
import path from "path";

type RawMatchedEntry = {
  gu: string;
  searchKeyword: string;
  matchedName: string;
  address?: string;
  roadAddress?: string;
  lat: string;
  lng: string;
};

type RawBranchCoordsFile = {
  matched: RawMatchedEntry[];
  mismatched: unknown[];
  notFound: unknown[];
};

/**
 * [2026-06-23 수동 검증으로 발견] matched 안에 있지만 신뢰할 수 없는 8건.
 * 키(gu+searchKeyword)로 식별. 검증 방법: searchKeyword가 가리키는 분관과
 * matchedName이 가리키는 분관이 이름상 서로 다른 시설인데, 같은 좌표가
 * 중복으로 채워져 있거나 이름이 전혀 안 맞는 경우.
 *
 *   - 강남구 "신사동주민도서관" → "압구정동주민센터 U도서관"과 동일 좌표로
 *     채워짐(신사동주민도서관 검색이 실패해서 그 위 항목 결과가 새어
 *     들어온 것으로 추정)
 *   - 강남구 "도곡2동주민도서관" → "개포1동 주민도서관"과 동일 좌표,
 *     이름이 전혀 다름
 *   - 영등포구 "대림1동 작은도서관" → "조롱박작은도서관"과 동일 좌표
 *   - 영등포구 "신길1동 작은도서관" → "밤동산작은도서관"과 동일 좌표
 *   - 영등포구 "영등포본동 작은도서관" → "청소년문화의집 작은도서관"과
 *     동일 좌표
 *   - 구로구 "구로1동 작은도서관" → "스마트도서관 구일역점", 이름 불일치
 *   - 구로구 "수궁동 작은도서관" → "온수역 스마트도서관", 이름 불일치
 *   - 서대문구 "아현역 스마트도서관" → 주소가 마포구로 나옴, 관할 구
 *     경계 문제인지 오매칭인지 불명확해 보류
 *
 * [2026-06-23 재검색(get-retry-coords.js) 결과 반영]
 * 추가 매칭 성공 20건은 SUSPICIOUS_KEYS에 없으므로 자동으로 포함됨.
 * 단, 아래는 재검색에서도 실패했거나 검토 후 제외 결정한 항목:
 *   - 강서구 "봉제산작은도서관" — 재검색해도 양천구 미감도서관이 잡힘,
 *     여전히 신뢰 불가
 *   - 강동구 "천호역 스마트도서관" — 재검색해도 송파구 시설이 잡힘
 *   - 중랑구 "용마산역 스마트도서관" — 재검색해도 광진구 시설이 잡힘
 *   - 중구 "어울림작은도서관" — 재검색해도 동대문구 시설이 잡힘
 *   - 관악구 "보물섬작은도서관"(신림동) — 재검색도 notFound
 *   - 관악구 "뜰안에작은도서관"·"샛별작은도서관"·"어울작은도서관"(신림동
 *     명시) — 여전히 다른 동의 동명 시설이 잡힘(예: "뜰안에"는 난향동에
 *     있고 "신림동"엔 없는 것으로 추정)
 *   - 관악구 "마루작은도서관" — 재검색해도 "한울작은도서관"이 잡힘,
 *     "마루"라는 이름 자체가 없을 가능성
 *   - 서초구 "내방역"·"구반포역" 작은도서관 — 재검색해도 무관한 동
 *     작은도서관이 잡힘, 그 역 주변에 작은도서관이 따로 없을 가능성
 *   - 서초구 "새싹어린이공원 스마트도서관" — 재검색도 notFound
 *   - 도봉구 "창1동"·"도봉1동" 작은도서관 — 재검색해도 다른 항목과
 *     좌표가 겹침, 정말로 해당 동엔 별도 작은도서관이 없을 가능성
 *   - 구로구 "옹달샘"·"별빛맞이"·"숲속"(단지명 포함 3건) — 재검색도
 *     notFound, 아파트 단지 내부 시설이라 카카오맵에 일반 장소로 등록
 *     안 되어 있을 가능성
 *   - 동대문구 "전곡마을"·"장안가온누리"·"장안벗꽃길" — 재검색도 notFound
 *   - 영등포구 "여의도브라이트도서관" — 재검색도 notFound
 *   - 강동구 "반딧불북카페"·"웃은책작은도서관" — 재검색도 notFound
 *   - 중랑구 "송곡여고열린작은도서관" — 재검색도 notFound
 *   - 관악구 "별별창작꿈터봉현작은도서관" — 재검색도 notFound
 *
 * 검토 후 정상으로 판단해 제외 명단에서 뺀 것(SUSPICIOUS_KEYS에 안 넣음):
 *   - 서대문구 "구청스마트도서관" — "서대문구청 스마트도서관"으로
 *     재검색해도 "서대문구 스마트도서관"이 나오는데, 핵심이름 비교가
 *     "구청"이라는 글자 하나 차이로 0이 나온 것일 뿐, "홍제역
 *     스마트도서관"의 결과(서대문구::홍제역 스마트도서관 = 같은 좌표)
 *     와도 겹치지 않아 독립된 정상 시설로 판단.
 *   - 서대문구 "아현역 스마트도서관" — 이름은 정확히 일치하나 주소가
 *     마포구로 나옴. 역 자체가 구 경계에 걸쳐있어 관할 표기가 다를 수
 *     있다고 판단, 좌표 자체는 신뢰하고 사용.
 */
/**
 * [2026-06-23 전부 해소] 이전엔 7건이 남아있었으나, 사용자가
 * https://lib.seoul.go.kr/slibsrch/main에서 직접 확인한 정확한 주소로
 * 전부 크로스체크 완료 — 7건 모두 1차 검색에서 잘못 잡혔던 결과와는
 * 명백히 다른 별개 시설(주소가 전혀 다른 건물)로 확인됨. 현재는 빈
 * Set이지만, 구조는 남겨둠 — 앞으로 비슷한 사고가 또 발견되면 여기에
 * 추가하면 됨.
 */
/**
 * [2026-06-24 재발견 — 빠뜨림] "7건 전부 해소"라고 기록했었으나, 실제로
 * address-coords.json 실행 결과(28건)를 세어보니 "대림1동작은도서관"이
 * 빠져있었음 — 요청한 주소(서울특별시 영등포구 디지털로 436)로 검색이
 * 실패한 것으로 추정. 비워뒀던 SUSPICIOUS_KEYS에 도로 추가함 — 검증
 * 안 된 채 "branch-coords.json"의 원래 잘못된 좌표(조롱박작은도서관과
 * 동일 좌표였던 그 사고)가 그대로 살아나는 걸 막기 위함.
 */
const SUSPICIOUS_KEYS = new Set<string>(["영등포구::대림1동 작은도서관"]);

function makeKey(gu: string, searchKeyword: string): string {
  return `${gu}::${searchKeyword}`;
}

export type BranchCoord = {
  gu: string;
  /** 통합검색 XML의 "도서관" 필드와 매칭시킬 이름 — matchedName 그대로 사용 */
  name: string;
  lat: number;
  lng: number;
};

let cachedCoords: BranchCoord[] | null = null;

/**
 * data/branch-coords.json(25개 구 1차 검색 결과)과
 * data/retry-coords.json(1차에서 실패한 48건을 키워드 보강해서 재검색한
 * 결과)을 둘 다 읽어서 합침. retry-coords.json은 없을 수도 있으므로
 * (재검색을 아직 안 했거나, 모두 1차에서 해결된 경우) 파일이 없으면
 * 조용히 건너뜀.
 *
 * mismatched + 위험 항목을 제외한 신뢰 가능한 좌표 목록을 반환. 결과는
 * 모듈 내에서 캐싱(서버 프로세스 생애주기 동안 파일을 한 번만 읽음).
 */
/**
 * [2026-06-24 변경] 4개 파일(branch-coords.json, retry-coords.json,
 * dobong-coords.json, address-coords.json)을 매번 따로 읽던 방식에서,
 * scripts/merge-branch-coords.js로 미리 병합해둔 단일 파일
 * (branch-coords-merged.json)을 읽는 방식으로 변경.
 *
 * 변경 이유: dobong-coords.json만 "notFound" 대신 "suspicious"라는 다른
 * 키 이름을 써서, 4개 파일을 함께 읽을 때 형식 불일치로 런타임 에러가
 * 발생함(TypeError: Cannot read properties of undefined (reading
 * 'length')). 병합 스크립트가 이런 파일별 형식 차이를 미리 흡수해두므로,
 * 이 함수는 이제 출처가 다른 파일들의 형식을 신경 쓸 필요가 없어짐.
 *
 * 병합된 파일의 각 항목에는 source 태그(initial/retry/dobong/address)가
 * 있으나, 현재 findBranchCoord의 매칭 로직(이름 기반)에는 source가
 * 필요하지 않으므로 이 함수에서는 읽기만 하고 별도 분기 없이 그대로 사용.
 */
export function loadBranchCoords(): BranchCoord[] {
  if (cachedCoords) return cachedCoords;

  const result: BranchCoord[] = [];
  let skippedSuspicious = 0;

  const filePath = path.join(process.cwd(), "data", "branch-coords-merged.json");

  if (!fs.existsSync(filePath)) {
    console.log("[branchCoords] branch-coords-merged.json 없음 — 좌표 없이 진행");
    cachedCoords = result;
    return result;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: { matched: (RawMatchedEntry & { source?: string })[] } = JSON.parse(raw);

  for (const entry of parsed.matched) {
    const key = makeKey(entry.gu, entry.searchKeyword);
    if (SUSPICIOUS_KEYS.has(key)) {
      skippedSuspicious++;
      continue;
    }

    const lat = parseFloat(entry.lat);
    const lng = parseFloat(entry.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    result.push({
      gu: entry.gu,
      name: entry.matchedName,
      lat,
      lng,
    });
  }

  console.log(
    `[branchCoords] loaded ${result.length} branches` +
      ` (excluded ${skippedSuspicious} suspicious, from merged file)`
  );

  cachedCoords = result;
  return result;
}

/**
 * 분관 이름으로 좌표 조회. 서울도서관 통합검색 XML의 "도서관" 필드 값
 * (예: "사당솔밭도서관", "역삼도서관")을 그대로 넣으면 됨.
 *
 * 매칭 전략: 정확히 일치하는 이름을 먼저 찾고, 없으면 공백을 제거한 뒤
 * 한쪽이 다른 쪽을 포함하는지 느슨하게 재시도 — 통합검색 XML의 표기와
 * 카카오맵 검색 결과의 표기가 미세하게 다를 수 있음(예: "아트앤힐링작은
 * 도서관" vs "아트&힐링작은도서관").
 */
export function findBranchCoord(libraryName: string): BranchCoord | undefined {
  const coords = loadBranchCoords();

  const exact = coords.find((c) => c.name === libraryName);
  if (exact) return exact;

  const normalize = (s: string) => s.replace(/[\s&]/g, "");
  const normalizedTarget = normalize(libraryName);

  return coords.find((c) => {
    const normalizedName = normalize(c.name);
    return (
      normalizedName === normalizedTarget ||
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    );
  });
}