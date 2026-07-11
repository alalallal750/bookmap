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

  // ────────────────────────────────────────────────────────────────
  // [2026-07-11 추가] 폴백은 25개 구 어디서든 발생할 수 있는데 위 11개
  // 구만 등록돼 있어서, 그 외 구(정상 스크래핑 구가 그날 타임아웃나서
  // 정보나루로 대체된 경우)는 전부 홈페이지로 떨어지고 있었음. 나머지
  // 구도 전수 실측 검증(헤드리스 크롬 + 2권 교차검증, 13-3 기준)해서
  // 채움. 구로구만 Angular SPA(4.4MB 미니파이 번들)라 API 엔드포인트를
  // 정적 분석으로 못 찾아 보류.
  // ────────────────────────────────────────────────────────────────

  // ISBN 상세검색 (송파·마포·영등포와 같은 plusSearch 계열) — 전부
  // 저자·ISBN·청구기호 일치 + 2권 교차검증(반대 ISBN 0건) 확인.
  광진구: (isbn) =>
    `https://www.gwangjinlib.seoul.kr/gjinfo/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,
  관악구: (isbn) =>
    `https://lib.gwanak.go.kr/galib/menu/10004/program/30002/searchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,
  동대문구: (isbn) =>
    `https://www.l4d.or.kr/intro/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,
  강남구: (isbn) =>
    `https://library.gangnam.go.kr/intro/plusSearchResultList.do` +
    `?searchType=DETAIL&searchKey5=ISBN&searchKeyword5=${encodeURIComponent(isbn)}` +
    `&searchLibrary=ALL&searchSort=SIMILAR&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE`,

  // 제목 검색 (ISBN 미지원 또는 미검증) — 전부 실제 <li> 결과 카드(저자·
  // 발행처·ISBN 등) 렌더링 확인 + 2권 교차검증 통과.
  중랑구: (_isbn, title) =>
    `https://www.jungnanglib.seoul.kr/intro/menu/10004/program/30002/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,
  동작구: (_isbn, title) =>
    `http://lib.dongjak.go.kr/dj/intro/search/index.do` +
    `?menu_idx=111&booktype=BOOK&libraryCodes=lib_MA,lib_MD,lib_MF,lib_ME,lib_MH,lib_MJ,lib_MK,lib_ML,lib_MC,lib_MN,lib_MP` +
    `&search_type=L_TITLE&search_text=${encodeURIComponent(title)}`,
  서대문구: (_isbn, title) =>
    `https://lib.sdm.or.kr/sdmlib/program/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 용산: 상단 검색폼의 hidden 필드 searchLibraryArr=MA가 없으면 500
  // 에러(경로가 잘못됨) — 실제 폼 그대로 반영해 해결.
  용산구: (_isbn, title) =>
    `https://www.yslibrary.or.kr/dream/searchResultList.do` +
    `?searchLibraryArr=MA&searchType=SIMPLE&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 도봉·성동·양천·종로(정독도서관 시스템 — 종로·서울시립어린이도서관
  // 소장정보까지 통합검색됨, 3관 전부 커버): 같은 벤더의 사이트 검색
  // 시스템(site/search) 계열. 도봉·성동은 전체 분관 코드 나열, 양천은
  // search_item=search_title 고정, 종로(정독)는 파라미터 없이 검색어만.
  도봉구: (_isbn, title) =>
    `https://www.unilib.dobong.kr/site/search/search00.do` +
    `?cmd_name=bookandnonbooksearch&search_type=detail&search_item=` +
    `&manage_code=MA,MB,MC,ME,MG,MJ,MF,MH,SA,MD,SB,SL,SM,SN,SO,SP,SK,SQ,SR,SS,ST,SU,SG,SH,SC` +
    `&search_txt=${encodeURIComponent(title)}`,
  성동구: (_isbn, title) =>
    `https://www.sdlib.or.kr/main/site/search/search00.do` +
    `?cmd_name=bookandnonbooksearch&search_type=detail&use_facet=N&search_item=search_title` +
    `&search_txt=${encodeURIComponent(title)}`,
  양천구: (_isbn, title) =>
    `https://lib.yangcheon.or.kr/main/site/search/bookSearch.do` +
    `?cmd_name=bookandnonbooksearch&search_type=detail&search_item=search_title` +
    `&search_txt=${encodeURIComponent(title)}`,
  종로구: (_isbn, title) =>
    `http://jdlib.sen.go.kr/jdlib/intro/search/index.do?search_text=${encodeURIComponent(title)}`,

  // 서초: 강서와 동일한 Nuri 프런트엔드 계열(app 번들 라우트 확인).
  서초구: (_isbn, title) => `https://public.seocholib.or.kr/KeywordSearchResult/${encodeURIComponent(title)}`,

  // [2026-07-11 조사 — 보류] 구로(Angular SPA, 4.4MB 미니파이 번들)는
  // API 엔드포인트를 정적 분석으로 못 찾음. #/total-search?keyword=
  // 라우트는 존재(state 정의 확인)하나 헤드리스 크롬으로 렌더링해도
  // XHR 데이터가 안 채워짐 — CDP 기반 네트워크 캡처 등 별도 도구 필요.
  // 미등록 상태로 두면 기존과 동일하게 홈페이지 폴백(악화 없음).
};

export function buildNaruPortalSearchUrl(
  gu: string,
  isbn: string,
  title: string
): string | undefined {
  const builder = PORTAL_SEARCH_URLS[gu];
  return builder ? builder(isbn, title) : undefined;
}
