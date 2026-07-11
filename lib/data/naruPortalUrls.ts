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

  // [실측 확인 2026-07-11] 영등포(ydplib)도 송파·마포와 같은 plusSearch 계열 —
  // ISBN 상세검색 결과에서 저자·ISBN·청구기호까지 정확히 일치 확인. 홍학의
  // 자리로 저자 "정해연", 불편한 편의점으로 저자 "김호연" 각각 확인, 교차
  // 검색 시 0건 확인(실제 <li> 카드 렌더링 기준 — 13-3 교훈 적용해 재확인).
  영등포구: (isbn) =>
    `https://www.ydplib.or.kr/intro/menu/10004/program/30002/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,

  // [실측 확인 2026-07-11] 강동(gdlibrary)은 ISBN 검색 파라미터가 없어
  // 제목 검색으로 연결. 서버 렌더링 확인 — 홍학의 자리로 8건, 불편한
  // 편의점으로 22건, 교차 필터링(반대 제목 검색 시 0건) 확인.
  강동구: (_isbn, title) =>
    `https://www.gdlibrary.or.kr/portal/menu/37/book/search` +
    `?searchType=title&searchInput=${encodeURIComponent(title)}&autoSearch=true`,

  // [실측 확인 2026-07-11 — 헤드리스 크롬 렌더링 검증] 아래 3곳은 검색엔진이
  // ISBN을 인식 못 하거나 거부(중구는 "ISBN 검색은 상세검색을 이용해주세요"
  // 알럿으로 명시 거부)해서 제목 검색으로 연결. 세 곳 모두 홍학의 자리/
  // 불편한 편의점 두 책으로 교차검증(반대 책 검색 시 0건) 통과.
  // 기존 URL(2026-07-09 등록분)은 성북=검색 폼 페이지로만 이동, 중구=필수
  // 파라미터(searchType·searchManageCode) 누락으로 진입 거부 — 실제로는
  // 동작하지 않았음.
  //
  // [2026-07-11 재수정] 첫 검증 방법의 결함 발견 — "홍학" 등 검색어 substring이
  // 페이지에 등장하는지만 확인했는데, 이 세 사이트는 검색창이 입력값을 그대로
  // 되돌려주는 에코(최근검색어·hidden input value)가 있어서 실제 결과 없이도
  // 매치가 나왔음(교차검증도 이 에코가 항상 검색어와 일치해 우연히 통과).
  // 실제 <li> 결과 카드(표지·저자·청구기호 등) 렌더링 여부로 재검증함.
  //
  // 성북: 최초 URL은 collection=ALL을 썼는데, 실제 검색 폼의 기본값은
  // collection=book이고 range=A 필드가 없으면 결과가 0건으로 렌더링됨
  // (도서관선택 목록의 모든 분관이 (0)으로 표시되는 걸로 확인). search.js의
  // doSearch() 함수가 실제로 세팅하는 hidden 필드 전체를 그대로 반영.
  성북구: (_isbn, title) =>
    `https://www.sblib.seoul.kr/library/menu/10012/program/30003/searchResultList.do` +
    `?query=${encodeURIComponent(title)}&collection=book&sort=${encodeURIComponent("RANK/DESC")}` +
    `&searchField=&resultCount=10&startCount=0&range=A&resultType=imageType` +
    `&categoryClassNo=ALL&categoryManageCode=&categoryEbookCatId=ALL`,
  // 중구·금천은 재검증에서 실제 표지 이미지+저자/ISBN 일치까지 확인되어 그대로 유지.
  중구: (_isbn, title) =>
    `https://www.junggulib.or.kr/SJGL/program/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,
  금천구: (_isbn, title) =>
    `http://geumcheonlib.seoul.kr/geumcheonlib/uce/search/totalList.do` +
    `?selfId=1097&searchKeyword=${encodeURIComponent(title)}`,

  // [실측 확인 2026-07-11 — 헤드리스 크롬 렌더링 검증] SPA지만 둘 다 해당
  // 책 카드(표지·서지·소장정보)까지 자동 렌더링됨을 확인.
  //   노원: 제목 검색 결과 1건 + 소장정보 버튼 렌더링 확인
  //   강북: ISBN 검색 결과 + 분관별 소장 수(강북 2, 청소년 1, 미아 1) 확인
  노원구: (_isbn, title) => `https://nowonlib.kr/KeywordSearchResult/${encodeURIComponent(title)}`,

  // [실측 확인 2026-07-11 — 헤드리스 크롬 렌더링 검증] 강서(lib.gangseo)는
  // 노원과 동일한 Nuri 프런트엔드 계열(app 번들에서 같은 KeywordSearchResult
  // 라우트 확인). 실제 책 카드(저자·발행처·청구기호·대출상태) 렌더링 +
  // 저자 패싯 카운트("정해연(27)", "김호연(97)")로 진짜 결과임을 확인,
  // 두 책 교차검증(반대 책 검색 시 0건) 통과.
  강서구: (_isbn, title) => `https://lib.gangseo.seoul.kr/KeywordSearchResult/${encodeURIComponent(title)}`,

  강북구: (isbn) =>
    `https://www.gblib.or.kr/gangbuk/search/total.do` +
    `#uri=list&a_lib=&a_key=&a_v=f&a_cp=1&a_qf=I&a_q=${encodeURIComponent(isbn)}&a_rf=T&a_rq=`,

  // [조사 완료 2026-07-11 — 자동 검색 불가] 은평(eplib)은 검색 상태를 URL이
  // 아니라 sessionStorage(vuex-persistedstate)로 관리해서 딥링크로 검색어를
  // 전달할 방법이 없음 (searchKeyword/keyword/q/query/searchWord 전부 무효,
  // 프런트 JS 분석으로 확인). 검색 페이지 연결이 사이트 구조상 최선 —
  // 사용자가 검색어만 입력하면 됨(홈페이지 폴백보다 한 단계 개선).
  은평구: () => `https://www.eplib.or.kr/unified/search.asp`,
};

export function buildNaruPortalSearchUrl(
  gu: string,
  isbn: string,
  title: string
): string | undefined {
  const builder = PORTAL_SEARCH_URLS[gu];
  return builder ? builder(isbn, title) : undefined;
}
