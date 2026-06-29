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
