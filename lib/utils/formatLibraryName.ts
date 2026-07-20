/**
 * 마커·상세패널에 표시할 도서관명 포맷 변환.
 *
 * 규칙:
 * 1. 대괄호 [] 및 내용 제거 (예: "[사당솔밭]종합자료실" → "종합자료실")
 * 2. 스마트도서관: "스마트도서관" 이후 제거 + "S" 붙임
 *    (예: "장승배기역 스마트도서관" → "장승배기역S")
 * 3. 그 외: 맨 끝 "도서관" 제거
 *    (예: "강동중앙도서관" → "강동중앙", "채우리작은도서관" → "채우리작은")
 */
export function formatLibraryName(name: string): string {
  if (!name?.trim()) return name ?? "";

  // 1. 대괄호 기호([])만 제거, 안의 내용은 유지
  //    예: "[ㅇㅇ구립도서관]" → "ㅇㅇ구립도서관" → 이후 "도서관" 제거 → "ㅇㅇ구립"
  let result = name.replace(/[\[\]]/g, "").trim();

  // 2. 스마트도서관
  const smartIdx = result.indexOf("스마트도서관");
  if (smartIdx !== -1) {
    const prefix = result.slice(0, smartIdx).trim();
    return prefix ? prefix + "S" : result;
  }

  // 3. 맨 끝 "도서관" 제거
  if (result.endsWith("도서관")) {
    const trimmed = result.slice(0, -3).trimEnd();
    return trimmed || result;
  }

  return result;
}

/**
 * [2026-07-20 — 전국판 마커 전용] 시도 지명 접두어 제거.
 * 정보나루 관명은 "부산광역시 사하도서관"·"부산광역시립구포도서관"처럼
 * 시도명이 일률적으로 붙는 경우가 많아 마커가 길어짐 — 지도가 이미 그
 * 지역이므로 접두어를 떼고 표시 (예: 부산광역시립사하 → 사하).
 * 긴 이름 우선 매칭. 접두어 뒤 "립"(시립/도립 잔여)·공백도 함께 제거.
 * 떼고 나면 이름이 사실상 사라지는 경우(예: "충남도서관"→"도서관")는
 * 원래 이름 유지.
 */
const REGION_PREFIXES = [
  "전남광주통합특별시",
  "강원특별자치도",
  "전북특별자치도",
  "제주특별자치도",
  "세종특별자치시",
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "경기도",
  "강원도",
  "제주도",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

export function formatNationwideLibraryName(name: string): string {
  if (!name?.trim()) return formatLibraryName(name);
  const prefix = REGION_PREFIXES.find((p) => name.startsWith(p));
  if (!prefix) return formatLibraryName(name);
  const stripped = name
    .slice(prefix.length)
    .replace(/^립/, "")
    .trim();
  // 지명을 떼면 이름이 안 남는 관("충남도서관" 등)은 원래 이름으로
  if (!stripped || stripped === "도서관") return formatLibraryName(name);
  return formatLibraryName(stripped);
}
