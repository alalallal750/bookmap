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

  // [실측 확인 2026-07-11] 마포(mplib)도 송파와 같은 plusSearch 계열 —
  // ISBN 상세검색이 서버 렌더링으로 동작. 홍학의 자리(9788954681155)로
  // 48건, 불편한 편의점(9791161571188)으로 60건, 서로 교차 필터링(다른
  // 책 ISBN으로는 0건) 확인해 필터링이 진짜 동작함을 검증.
  마포구: (isbn) =>
    `https://mplib.mapo.go.kr/mcl/MENU1039/PGM3007/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,

  // [실측 확인 2026-07-11] 강동(gdlibrary)은 ISBN 검색 파라미터가 없어
  // 제목 검색으로 연결. 서버 렌더링 확인 — 홍학의 자리로 8건, 불편한
  // 편의점으로 22건, 교차 필터링(반대 제목 검색 시 0건) 확인.
  강동구: (_isbn, title) =>
    `https://www.gdlibrary.or.kr/portal/menu/37/book/search` +
    `?searchType=title&searchInput=${encodeURIComponent(title)}&autoSearch=true`,

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

  // [미검증 2026-07-11] SPA(Vue/React 등) 응답이라 curl로 결과 화면을
  // 확인 못 함 — 검색 페이지에는 도달하나 자동 실행 여부 실기기 확인 필요.
  // 없는 것보다 낫다는 판단으로 우선 연결(홈페이지 폴백보다 한 단계 나음).
  노원구: (_isbn, title) => `https://nowonlib.kr/KeywordSearchResult/${encodeURIComponent(title)}`,
  강북구: (isbn) =>
    `https://www.gblib.or.kr/gangbuk/search/total.do` +
    `#uri=list&a_lib=&a_key=&a_v=f&a_cp=1&a_qf=I&a_q=${encodeURIComponent(isbn)}&a_rf=T&a_rq=`,
};

export function buildNaruPortalSearchUrl(
  gu: string,
  isbn: string,
  title: string
): string | undefined {
  const builder = PORTAL_SEARCH_URLS[gu];
  return builder ? builder(isbn, title) : undefined;
}
