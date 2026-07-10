/**
 * 정보나루 경로 결과의 "대출 가능한지 확인하기" 버튼용 — 각 구 도서관
 * 포털의 검색결과 URL 빌더.
 *
 * [2026-07-09 설계 결정] 정보나루는 포털 상세페이지 URL(내부 관리번호
 * 필요)을 주지 않으므로, 그 책만 뜨는 ISBN 검색결과 화면으로 연결한다.
 * ISBN 검색을 지원하지 않는 포털은 제목 검색결과로 대체(전자책과 동일
 * 수준). 실측 안 된 구는 undefined를 반환 — 호출부가 도서관 홈페이지로
 * 대신 연결함.
 *
 * 패턴은 전부 실제 브라우저/curl 실측으로 확인한 것만 추가할 것
 * (전자책 buildSearchPageUrl과 같은 원칙).
 */

type UrlBuilder = (isbn: string, title: string) => string;

const PORTAL_SEARCH_URLS: Record<string, UrlBuilder> = {
  // [실측 확인 2026-07-09] ISBN 상세검색 — 아몬드(9788936434267)로 9건
  // 확인. splib은 마포(mplib)와 같은 plusSearch 계열이며 DETAIL 모드의
  // searchKey5=ISBN이 동작함 (SIMPLE 모드는 ISBN 미지원 — 0건).
  송파구: (isbn) =>
    `https://www.splib.or.kr/intro/menu/10004/program/30002/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,

  // [미검증 2026-07-09] 아래 3곳은 검색 결과가 JS 렌더링이라 서버 응답만으로
  // 자동 실행 여부를 확인 못 함 — 검색 페이지+파라미터로 연결(최소한 검색
  // 화면에는 도달). 실기기에서 자동 실행이 안 되는 것으로 확인되면 파라미터
  // 조정 또는 제목 검색으로 교체할 것.
  성북구: (isbn) =>
    `https://www.sblib.seoul.kr/library/menu/10012/program/30003/searchSimple.do` +
    `?query=${encodeURIComponent(isbn)}&collection=ALL&startCount=0`,
  중구: (isbn) =>
    `https://www.junggulib.or.kr/SJGL/program/searchSimple.do` +
    `?searchType=SIMPLE&searchKeyword=${encodeURIComponent(isbn)}`,
  금천구: (isbn) =>
    `http://geumcheonlib.seoul.kr/geumcheonlib/uce/search/totalList.do` +
    `?selfId=1097&searchKeyword=${encodeURIComponent(isbn)}`,
};

export function buildNaruPortalSearchUrl(
  gu: string,
  isbn: string,
  title: string
): string | undefined {
  const builder = PORTAL_SEARCH_URLS[gu];
  return builder ? builder(isbn, title) : undefined;
}
