/**
 * [2026-07-19 신설 — 전국판] 비서울 도서관 마커 상세패널의 "확인" 버튼용 —
 * 도메인(hostname)별 검색결과 URL 빌더.
 *
 * 서울판 naruPortalUrls.ts와 같은 철학: **헤드리스 크롬 렌더링으로 "실제
 * 책 카드가 뜨는지"까지 확인된 도메인만 등록** (13-3 교훈 — 문자열 매칭·
 * 추정만으로 등록 금지). 미등록 도메인은 호출부가 도서관 홈페이지로 폴백
 * (악화 없음).
 *
 * 검증 방법 (verify_portal_headless.mjs, 2단계 전수조사):
 *   1. 템플릿에 "불편한 편의점" → 렌더링된 본문에 제목+저자(김호연) 확인
 *   2. 같은 템플릿에 "홍학의 자리" → 저자(정해연) 확인 (두 책 교차검증)
 * 결과 전문: 지금빌려 claude code/nationwide_portal_headless_report.md
 *
 * 비서울 포털은 ISBN 검색 지원이 확인되지 않아 전부 제목 검색으로 연결
 * (전자책 buildSearchPageUrl과 동일 수준).
 */

/**
 * hostname → 검색 URL 빌더. homepage는 대구처럼 경로에 구 식별자가 있는 통합
 * 사이트용. libCode(정보나루)는 소장처 facet 딥링크가 되는 포털에서 그 관만
 * 지정하는 데 씀(2026-07-22 — 광양·울산동구·평창 등). 없으면 전관 검색.
 */
type NationwideUrlBuilder = (
  title: string,
  homepage: string,
  libCode?: string
) => string | undefined;

/** libCode→포털 소장처 코드 맵에서 필터 조각을 만든다. 매핑 없으면 빈 문자열(전관). */
function facetParam(
  map: Record<string, string>,
  param: string,
  libCode?: string
): string {
  const code = libCode ? map[libCode] : undefined;
  return code ? `&${param}=${encodeURIComponent(code)}` : "";
}

const PORTAL_TEMPLATES: Record<string, NationwideUrlBuilder> = {
  // ── 2026-07-19 헤드리스 전수조사(상위 50 도메인) 통과분 ──────────────
  // 각 항목: 두 책(불편한 편의점/홍학의 자리) 모두 실제 결과 카드 렌더링 확인.

  // 안산(27관) — 서울 노원·강서·서초와 같은 Nuri 프런트엔드 계열
  "lib.ansan.go.kr": (title) =>
    `https://lib.ansan.go.kr/KeywordSearchResult/${encodeURIComponent(title)}`,

  // 경북교육청 통합(27관)
  "www.gbelib.kr": (title) =>
    `https://www.gbelib.kr/gbelib/intro/totalSearch/index.do?menu_idx=150&booktype=TOTAL` +
    `&search_text=${encodeURIComponent(title)}`,

  // 수원(23관) — 본 사이트 검색이 모바일 도메인(mob)으로 서빙됨 (1단계
  // SSR 통과 + 2단계 재확인. 데스크톱에서도 정상 렌더링)
  "www.suwonlib.go.kr": (title) =>
    `https://mob.suwonlib.go.kr/search?searchWord=${encodeURIComponent(title)}`,

  // 용인(20관) — plusSearch 계열, 렌더링된 검색 폼에서 추출한 파라미터 전체 유지
  "lib.yongin.go.kr": (title) =>
    `https://lib.yongin.go.kr/intro/plusSearchResultList.do?searchType=SIMPLE&searchCategory=BOOK` +
    `&searchKey=ALL&searchTotalPbLibrary=ALL&searchPbLibrary=ALL&SearchStLibrary=ALL&SearchSmLibrary=ALL` +
    `&searchKeyword=${encodeURIComponent(title)}&mainKeyword=${encodeURIComponent(title)}`,

  // 세종(15관) — 서울 성동·양천과 같은 site/search 계열
  "lib.sejong.go.kr": (title) =>
    `https://lib.sejong.go.kr/main/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
    `&manage_code=MS&search_type=detail&search_item=search_title&search_txt=${encodeURIComponent(title)}`,

  // 제주(15관) — 도청 통합검색의 도서관 검색 (jeju.go.kr 호스트로 서빙)
  "lib.jeju.go.kr": (title) =>
    `https://www.jeju.go.kr/lib/service/search/simple.htm?q=${encodeURIComponent(title)}`,

  // 시흥(12관) — SPA 해시 라우트지만 자동 검색·카드 렌더링 확인
  "lib.siheung.go.kr": (title) =>
    `https://lib.siheung.go.kr/#/total-search?keyword=${encodeURIComponent(title)}`,

  // 울산 중구(10관) — 1단계 SSR 통과 + 2단계 재확인
  "lib.junggu.ulsan.kr": (title) =>
    `https://lib.junggu.ulsan.kr/lib/unit/search/list.do?search_txt=${encodeURIComponent(title)}`,

  // ── 2026-07-19 2차 재조사 통과분 ─────────────────────────────────────
  // 핵심 발견(사용자 제보 대구 URL에서 일반화): 검색 폼 "페이지"의 폼을
  // hidden 필드(menu_idx·booktype 등)까지 통째로 직렬화해야 자동 실행됨.
  // 전부 동일 기준(두 책 교차검증 + 실제 결과 카드 렌더링) 통과.
  // 파주·이천·아산은 폼의 세션 토큰(csSignature/_csrf) 제거 후 재검증 완료.

  // 대구 통합(68관) — 구별 하위경로 공통 패턴. 13개 하위경로(달서·북구·중구·
  // 서구·범어·동구·고산·2·28·달성·수성·중앙(center)·시립(dglib)·용학) 전수
  // 검증 통과 — 플랫폼 균일 확인되어 하위경로 일반화 등록.
  "library.daegu.go.kr": (title, homepage) => {
    const sub = new URL(homepage).pathname.split("/").filter(Boolean)[0];
    if (!sub) return undefined;
    return (
      `https://library.daegu.go.kr/${sub}/intro/search/index.do` +
      `?menu_idx=9&booktype=BOOKANDNONBOOK&title=${encodeURIComponent(title)}#search_result`
    );
  },
  // 대구 동구(11관)·달성군(8관) — 자체 도메인이지만 검색은 대구 통합 사이트
  "www.donggu-lib.kr": (title) =>
    `https://library.daegu.go.kr/donggu/intro/search/index.do` +
    `?menu_idx=9&booktype=BOOKANDNONBOOK&title=${encodeURIComponent(title)}#search_result`,
  "dalseong.daegu.kr": (title) =>
    `https://library.daegu.go.kr/dalseonglib/intro/search/index.do` +
    `?menu_idx=9&booktype=BOOKANDNONBOOK&title=${encodeURIComponent(title)}#search_result`,

  // 김해(45관) — libbook :8000은 별도 시스템이 아니라 "김해통합도서관
  // 자료검색" 공식 시스템(장유·율하·칠암 등 전 분관 통합)임을 내용으로 확인
  "lib.gimhae.go.kr": (title) =>
    `http://libbook.gimhae.go.kr:8000/bookv2/smartlib/list.php?cpage=1&stype=total&sstring=${encodeURIComponent(title)}`,

  // 포항(42관)
  "phlib.pohang.go.kr": (title) =>
    `https://phlib.pohang.go.kr/phlib/intro/search/index.do?menu_idx=297&search_type2=TITLE` +
    `&LibraryCodes=GuALL%2CMD%2CMA%2CMB%2CMC%2CME%2CMF%2CPM%2CMH%2CMI%2CMJ%2CDongALL%2CNA%2CNB%2CNC%2CND%2CNF%2CNG%2CNH%2CNE%2CNJ%2CNK%2CNL%2CNM%2CNN%2CNP%2CNQ%2CNS%2CNU%2CNV%2CNW%2CNY%2CNZ%2CPC%2CPD%2CPE%2CPG%2CPH%2CPI%2CPJ%2CPK%2CPL%2CPN%2CPQ%2CZZ%2CPS%2CPT%2CPU%2CPB%2CPV%2CPR` +
    `&booktype=BOOK&search_type=${encodeURIComponent("소장자료검색")}&search_text=${encodeURIComponent(title)}`,

  // 파주(22관) — 세션 토큰(csSignature) 제거 후 재검증 통과
  "lib.paju.go.kr": (title) =>
    `https://lib.paju.go.kr/jalib/plusSearchResultList.do?searchType=SIMPLE&searchCategory=ALL` +
    `&searchLibrary=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 전북교육청(18관)
  "lib.jbe.go.kr": (title) =>
    `https://lib.jbe.go.kr/jbe/intro/search/index.do?menu_idx=9&search_type=L_TITLE&booktype=BOOK` +
    `&libraryCodes=MA&libraryCodes=MB&libraryCodes=MC&libraryCodes=MD&libraryCodes=ME&libraryCodes=MF` +
    `&libraryCodes=MG&libraryCodes=MH&libraryCodes=MJ&libraryCodes=MK&libraryCodes=MN&libraryCodes=MP` +
    `&libraryCodes=MQ&libraryCodes=MR&libraryCodes=MS&libraryCodes=MT&libraryCodes=MU&libraryCodes=MV` +
    `&search_text=${encodeURIComponent(title)}`,

  // 평택(14관)
  "www.ptlib.go.kr": (title) =>
    `https://www.ptlib.go.kr/intro/plusSearchResultList.do?searchType=SIMPLE&searchCategory=ALL` +
    `&searchLibrary=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 울산 북구(22관) — 세종과 같은 site/search 계열 파라미터로 통과
  "usbl.bukgu.ulsan.kr": (title) =>
    `https://usbl.bukgu.ulsan.kr/main/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
    `&search_type=detail&search_item=search_title&search_txt=${encodeURIComponent(title)}`,

  // 경기도교육청(11관) — 대구처럼 지점별 하위경로(gg·sn·ujb·pt·kwa·gimpo·
  // hs·gj·pc·gn·gglec). 과천(사용자 캡처 URL)·성남·중앙(lib) 3곳 교차검증
  // 통과로 패턴 일반화. 하위경로 없으면 undefined → 홈페이지 폴백
  "lib.goe.go.kr": (title, homepage) => {
    const sub = new URL(homepage).pathname.split("/").filter(Boolean)[0];
    if (!sub) return undefined;
    return (
      `https://lib.goe.go.kr/${sub}/intro/search/index.do?menu_idx=10&booktype=BOOKANDNONBOOK` +
      `&search_text=${encodeURIComponent(title)}#search_result`
    );
  },

  // 인천교육청(9관)
  "lib.ice.go.kr": (title) =>
    `https://lib.ice.go.kr/ice/intro/search/index.do?menu_idx=113&booktype=BOOK&search_type=L_TITLE` +
    `&search_text=${encodeURIComponent(title)}`,

  // 오산(10관)
  "www.osanlibrary.go.kr": (title) =>
    `https://www.osanlibrary.go.kr/intro/program/plusSearchResultList.do?searchType=SIMPLE` +
    `&searchCategory=ALL&searchKey=TITLE&searchKeyword=${encodeURIComponent(title)}`,

  // 여주(10관)
  "www.libyj.go.kr": (title) =>
    `https://www.libyj.go.kr/ojlake/plusSearchResultList.do?searchType=SIMPLE&searchCategory=ALL` +
    `&searchLibrary=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 창원(9관) — 사용자가 브라우저에서 확인했던 패턴에 lib_code·outter 추가로 통과
  "lib.changwon.go.kr": (title) =>
    `https://lib.changwon.go.kr/book/search.php?lib_code=cl&search_type=normal` +
    `&search_txt=${encodeURIComponent(title)}&outter=Y`,

  // 순천(9관)
  "library.suncheon.go.kr": (title) =>
    `https://library.suncheon.go.kr/lib/book/search/searchIndex.do?searchType=&menuCd=L001001001` +
    `&mediaCode=&searchTag_list=on&search=${encodeURIComponent(title)}`,

  // 울진(9관)
  "lib.uljin.go.kr": (title) =>
    `https://lib.uljin.go.kr/content/01search/01_01.php?TAG1_cmd=IAL&TAG1_keyword=${encodeURIComponent(title)}`,

  // 이천 작은도서관 통합(9관) — CSRF 토큰 제거 후 재검증 통과
  "small.icheonlib.go.kr": (title) =>
    `https://small.icheonlib.go.kr/search/tot/result?si=TOTAL&st=KWRD&q=${encodeURIComponent(title)}`,

  // 김제(9관)
  "gjl.gimje.go.kr": (title) =>
    `https://gjl.gimje.go.kr/index.gimje?menuCd=DOM_000000101000000000&book_type=BOOK` +
    `&manage_code=MA%2CMK%2CGG%2CAL&search_txt=${encodeURIComponent(title)}`,

  // 춘천(8관)
  "library.chuncheon.go.kr": (title) =>
    `https://library.chuncheon.go.kr/search/book-search/librarybook/?searchType=ALL` +
    `&manage=MA%2CAM%2CTM%2CHM%2CSM%2CNM%2CDM%2CYM%2CDD&searchTitle=&searchAuthor=&searchPublisher=` +
    `&searchIsbn=&searchKeyword=&searchYearStart=&searchYearEnd=&bookType=BOOK&facetManageCode=` +
    `&facetAuthor=&facetPublisher=&facetPubYear=&searchTxt=${encodeURIComponent(title)}`,

  // 아산(7관) — dls 화면이지만 아산중앙·배방·둔포 등 시립 전체 검색임을
  // 내용으로 확인. CSRF 토큰 제거 후 재검증 통과
  "ascl.asan.go.kr": (title) =>
    `https://lib.asan.go.kr/dls_le/index.php?mod=wdDataSearch&act=searchIList&deSearch=2&item=total` +
    `&word=${encodeURIComponent(title)}`,

  // ── 2026-07-19 3차: 웹검색("지역명 도서관 통합검색") 기반 발굴 ────────
  // 사용자 제안 방법. 검색엔진에 인덱싱된 검색결과 URL·통합 포털을 수집해
  // 동일 기준(두 책 교차검증)으로 검증한 것만 등록.

  // 화성(31관) — 검색엔진에 인덱싱된 searchResultList.do URL 그대로 통과
  "www.hscitylib.or.kr": (title) =>
    `https://www.hscitylib.or.kr/intro/menu/10008/program/30001/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 고양(27관) — 화성과 같은 벤더, 검색 폼 페이지(searchSimple.do)의 결과
  // 경로(searchResultList.do)로 통과
  "www.goyanglib.or.kr": (title) =>
    `https://www.goyanglib.or.kr/center/menu/10003/program/30001/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 청주(15관) — 아산과 같은 dls 벤더의 "도서관 통합자료 검색"
  "library.cheongju.go.kr": (title) =>
    `https://cjlibrary.cheongju.go.kr/lib/dls_le/index.php?mod=wdDataSearch&act=searchIList` +
    `&deSearch=2&item=total&word=${encodeURIComponent(title)}`,

  // 당진(12관) — 아산·청주와 같은 dls 벤더 (1단계 ssr-verified였다가 탈락한
  // search2.jsp 대신 시립도서관 통합검색으로)
  "www.dangjin.go.kr": (title) =>
    `https://lib.dangjin.go.kr/dls_le/index.php?mod=wdDataSearch&act=searchIList` +
    `&deSearch=2&item=total&word=${encodeURIComponent(title)}`,

  // 부천(34관) — 도서검색 시스템(alpasq)의 경로형 키워드 검색
  "www.bcl.go.kr": (title) =>
    `https://alpasq.bcl.go.kr/search/keyword/${encodeURIComponent(title)}`,

  // 의정부(6관) — 대표홈페이지 자료검색, 폼 직렬화(booktype=ALL)로 통과
  "www.uilib.go.kr": (title) =>
    `https://www.uilib.go.kr/main/intro/search/index.do?menu_idx=9&booktype=ALL` +
    `&title=${encodeURIComponent(title)}`,

  // 안양(11관) — 사용자 캡처 상세페이지 URL에서 목록(searchResultList.do)
  // 역산. 화성·고양과 같은 벤더
  "lib.anyang.go.kr": (title) =>
    `https://lib.anyang.go.kr/intro/menu/10003/program/30001/searchResultList.do` +
    `?searchType=SIMPLE&searchManageCode=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 성남(17관) — 사용자 캡처 URL에서 역산. 송파·용인과 같은 plusSearch 벤더
  "www.snlib.go.kr": (title) =>
    `https://www.snlib.go.kr/intro/menu/10041/program/30009/plusSearchResultList.do` +
    `?searchType=SIMPLE&searchCategory=BOOK&searchKey=ALL&searchPbLibrary=ALL&searchSort=SIMILAR` +
    `&searchOrder=DESC&searchRecordCount=20&currentPageNo=1&viewStatus=IMAGE` +
    `&searchKeyword=${encodeURIComponent(title)}`,

  // ── 2026-07-19 5차: 사용자 캡처 URL 역산 ─────────────────────────────
  // 사용자가 각 사이트에서 검색 1회 실행 후 캡처한 URL에서 템플릿 역산.

  // 강원교육청(22관) — 전 지점 manageCodes 나열 (캡처 URL 그대로)
  "lib.gwe.go.kr": (title) =>
    `https://lib.gwe.go.kr/portal/menu/568/book/search?search=true&searchType=normal&page=1&size=10` +
    `&searchCondition=searchTxt&searchInput=${encodeURIComponent(title)}` +
    `&manageCodes=MC&manageCodes=MX&manageCodes=MY&manageCodes=MH&manageCodes=MG&manageCodes=ME` +
    `&manageCodes=MJ&manageCodes=MD&manageCodes=MV&manageCodes=MK&manageCodes=MQ&manageCodes=MB` +
    `&manageCodes=MW&manageCodes=MS&manageCodes=MT&manageCodes=MF&manageCodes=MA&manageCodes=MM` +
    `&manageCodes=MR&manageCodes=MN&manageCodes=MU&manageCodes=MP`,

  // 남양주(13관) — plusSearch 벤더 (jyy 포털 경로, searchLibrary=ALL로 전관)
  "lib.nyj.go.kr": (title) =>
    `https://lib.nyj.go.kr/jyy/plusSearchResultList.do?searchType=SIMPLE&searchCategory=ALL` +
    `&searchLibrary=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}`,

  // 의왕(10관) — 서대문과 같은 program/searchResultList 계열
  "www.uwlib.or.kr": (title) =>
    `http://www.uwlib.or.kr/jungang/program/searchResultList.do?searchPbLibrary=ALL&searchType=SIMPLE` +
    `&searchCategory=ALL&searchField=ALL&searchLibrary=ALL&searchSmLibrary=ALL` +
    `&searchWord=${encodeURIComponent(title)}`,
  "uwlib.or.kr": (title) =>
    `http://www.uwlib.or.kr/jungang/program/searchResultList.do?searchPbLibrary=ALL&searchType=SIMPLE` +
    `&searchCategory=ALL&searchField=ALL&searchLibrary=ALL&searchSmLibrary=ALL` +
    `&searchWord=${encodeURIComponent(title)}`,

  // 양평(8관) — 경로형 searchResult
  "www.yplib.go.kr": (title) =>
    `https://www.yplib.go.kr/searchResult?keyword=${encodeURIComponent(title)}&pageIndex=1`,

  // 포천(7관) — 2단 프로브(자료검색 페이지에서 타이핑 제출)로 발견.
  // 용인·성남과 같은 plusSearch 벤더
  "lib.pocheon.go.kr": (title) =>
    `https://lib.pocheon.go.kr/intro/menu/10023/program/30003/plusSearchResultList.do` +
    `?searchType=SIMPLE&searchCategory=ALL&aaa=ALL&searchKey=TITLE&searchLibrary=ALL` +
    `&searchLibraryArr=MA&searchLibraryArr=MB&searchLibraryArr=MF&searchLibraryArr=MC` +
    `&searchLibraryArr=MD&searchLibraryArr=ME&searchLibraryArr=MG` +
    `&searchKeyword=${encodeURIComponent(title)}`,

  // 부산교육청(14관) — 통합도서관(one-library) 검색. 렌더링 확인: 전 구·군
  // 소장처 879건 — 부산 전역 검색 맞음
  "home.pen.go.kr": (title) =>
    `https://one-library.busan.go.kr/busanbooks/?mode=tBookList&page_id=result&mapflag=` +
    `&manage_code=&search_title=${encodeURIComponent(title)}` +
    `&search_author=&search_publisher=&search_keyword=&search_start_date=&search_end_date=`,

  // 김포(지점 7곳) — 통합검색은 없고 지점별 간략검색만 가능. 각 지점
  // 공식 페이지 메뉴에서 추출한 key·manageCode 사용, 장기·모담 2곳
  // 교차검증으로 패턴 일반화 확인. 지점 경로가 없는 관(/lib/ 등)은
  // undefined → 홈페이지 폴백
  "www.gimpo.go.kr": (title, homepage) => {
    const branches: Record<string, { key: string; mc: string }> = {
      janggi: { key: "2780", mc: "JG" },
      modam: { key: "11488", mc: "MD" },
      pungmu: { key: "3052", mc: "PM" },
      gochon: { key: "2984", mc: "GC" },
      masan: { key: "6997", mc: "MS" },
      yanggok: { key: "2916", mc: "YG" },
      tongjin: { key: "3120", mc: "TJ" },
    };
    const sub = new URL(homepage).pathname.split("/").filter(Boolean)[0];
    const b = sub ? branches[sub] : undefined;
    if (!b) return undefined;
    return (
      `https://www.gimpo.go.kr/${sub}/bookSearchList.do?key=${b.key}&rep=1&option=0` +
      `&pageUnit=10&manageCode=${b.mc}&searchKrwd=${encodeURIComponent(title)}`
    );
  },

  // ── 2026-07-22 소장처 facet 딥링크(대전식) — 헤드리스 확정 + GET필터 스코핑
  // 실검증(X≠Y 차등). libCode→포털 소장처 코드로 그 관만 지정. 매핑 없는 관은
  // 전관 검색으로 폴백(악화 없음). ───────────────────────────────────────

  // 광양(6관) — lib/book/search 벤더, manageCd. 6/6 매핑, 건수 55→6 실측.
  "lib.gwangyang.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "146024": "MA", // 중앙도서관
      "146050": "MB", // 중마도서관
      "146177": "ME", // 희망도서관
      "146049": "MD", // 용강도서관
      "146181": "MF", // 금호도서관
      "146185": "MG", // 광영도서관
    };
    return (
      `https://lib.gwangyang.go.kr/lib/book/search/searchIndex.do?searchType=&menuCd=L001001001` +
      `&search=${encodeURIComponent(title)}` +
      facetParam(map, "manageCd", libCode)
    );
  },

  // 울산 동구(5관) — site/search bookSearch.do 벤더, manage_code. 5/5 매핑.
  "library.donggu.ulsan.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "131082": "ME", // 남목도서관
      "131016": "MA", // 마성만화도서관
      "131021": "MB", // 전하작은도서관
      "131022": "MC", // 화정아이꿈누리도서관(화정작은)
      "131028": "MD", // 꽃바위작은도서관
    };
    return (
      `https://library.donggu.ulsan.kr/main/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
      `&search_type=detail&search_item=search_title&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code", libCode)
    );
  },

  // 연천(6관) — plusSearch. 검색 경로가 /menu/10039/program/30005/(사용자 제보
  // URL로 확정 — 루트 경로가 아니라 이 menu/program 경로여야 필터 먹음).
  // searchLibraryArr로 관 지정, 6/6 매핑. MA≠BR 차등 실측.
  "library.yeoncheon.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141013": "MA", // 연천군중앙도서관
      "141117": "BR", // 연천도서관
      "141250": "ME", // 청산작은도서관
      "141228": "MD", // 학마을작은도서관
      "741044": "MF", // 무등실작은도서관
      "741168": "MG", // 신서작은도서관
    };
    return (
      `https://library.yeoncheon.go.kr/menu/10039/program/30005/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchKey=TITLE&searchKeyword=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 가평(4관) — plusSearch, 경로 /intro/menu/10035/program/30005/(사용자 제보).
  // searchLibraryArr, 4/4 매핑. MA≠MB 차등 실측.
  "www.gaplib.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141001": "MA", // 한석봉도서관
      "141143": "MC", // 설악도서관
      "141105": "MB", // 조종도서관
      "141286": "MD", // 청평도서관
    };
    return (
      `https://www.gaplib.go.kr/intro/menu/10035/program/30005/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 동해(5관) — plusSearch. 검색 param이 searchWord(연천/가평의 searchKeyword가
  // 아님 — 개발자도구 Network 캡처로 확정). 경로 /web/menu/10003/program/30001/.
  // searchLibraryArr, 5/5 매핑. 콜드스타트 결과 렌더+MA≠MB 차등 실측.
  "donghaelib.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "142037": "MA", // 북삼도서관
      "142034": "MB", // 발한도서관
      "142051": "MC", // 무릉작은도서관
      "142057": "MD", // 등대작은도서관
      "142056": "ME", // 이도작은도서관
    };
    return (
      `https://donghaelib.go.kr/web/menu/10003/program/30001/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchField=ALL&searchWord=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 원주(5관) — portal 벤더 /mr/menu/840/book/search, manageCodes(사용자 제보).
  // searchCondition=searchTitle + searchTitle. 5/5 매핑. MA≠MQ 차등 실측.
  "lib.wonju.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "142015": "MA", // 원주시립중앙도서관
      "142118": "MQ", // 미리내도서관
      "142123": "MS", // 샘마루도서관
      "142129": "MU", // 생각자람어린이도서관
      "142058": "MB", // 태장도서관
    };
    return (
      `https://lib.wonju.go.kr/mr/menu/840/book/search?search=true&searchType=detail` +
      `&searchCondition=searchTitle&searchTitle=${encodeURIComponent(title)}` +
      facetParam(map, "manageCodes", libCode)
    );
  },

  // ── 2026-07-22 추가 (사용자 제보 URL 기반, 전부 X≠Y 차등 실측) ──

  // 경기광주(8관) — kolaseek plusSearch(포트 8443, Network 캡처로 발견).
  // searchLibraryArr, 10/10 매핑. MA≠MB 차등 실측.
  "lib.gjcity.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141114": "MA", // 광주시립중앙도서관
      "141236": "MB", // 광주시립오포도서관
      "141235": "MC", // 광주시립곤지암도서관
      "141512": "MH", // 광주시립초월도서관
      "141576": "MJ", // 광주시립능평도서관
      "141147": "MD", // 대주작은도서관
      "141392": "MF", // 퇴촌작은도서관
      "141399": "MG", // 도척작은도서관
      "741089": "MI", // 광남작은도서관
      "741464": "MK", // 남한산성작은도서관
    };
    return (
      `https://lib.gjcity.go.kr:8443/kolaseek/plus/search/plusSearchResultList.do` +
      `?searchType=SIMPLE&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 광명(6관) — dls_le 벤더(아산 계열, Network 캡처). manageCode, 6/6 매핑.
  "gmlib.gm.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141080": "MA", // 광명도서관
      "141019": "MB", // 하안도서관
      "141155": "MD", // 충현도서관
      "141405": "ME", // 철산도서관
      "141561": "MF", // 소하도서관
      "141613": "MJ", // 연서도서관
    };
    return (
      `https://gmlib.gm.go.kr/dls_le/index.php?mod=wdDataSearch&act=searchIList&item=total` +
      `&word=${encodeURIComponent(title)}` +
      facetParam(map, "manageCode", libCode)
    );
  },

  // 구미(13관) — dls_lt 벤더(Network 캡처). manageCode. 본관 7/7 + 작은도서관은
  // 통합코드 BA. (구미시립작은도서관 147133은 미매핑 → 전관 폴백)
  "lib.gumi.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "147038": "MA", // 구미시립중앙도서관
      "147051": "MB", // 인동도서관
      "147029": "MC", // 선산도서관
      "147062": "MD", // 봉곡도서관
      "147119": "ME", // 상모정수도서관
      "147169": "MG", // 양포도서관
      "147178": "MH", // 산동도서관
      "14703810": "BA", // 생활문화센터작은도서관(작은도서관 통합)
      "14703811": "BA", // 송정나래작은도서관
      "14703812": "BA", // 평생학습원 자료실
      "14703813": "BA", // 한국폴리텍구미캠퍼스작은도서관
      "14703801": "BA", // 해평누리작은도서관
    };
    return (
      `https://lib.gumi.go.kr/dls_lt/index.php?mod=wdDataSearch&act=searchResultList&searchItem=total` +
      `&searchWord=${encodeURIComponent(title)}` +
      facetParam(map, "manageCode", libCode)
    );
  },

  // 부평(인천, 6관) — plusSearch, searchLibraryArr, searchWord. 6/6 매핑.
  "www.bppl.or.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "128040": "MC", // 갈산도서관
      "128057": "ME", // 부개도서관
      "128035": "MB", // 부개어린이도서관
      "128056": "MD", // 삼산도서관
      "128085": "MF", // 청천도서관
      "128007": "MA", // 부평기적의도서관
    };
    return (
      `https://www.bppl.or.kr/bugae/menu/10095/program/30031/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=BOOK&searchField=ALL&searchWord=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 경주(경북, 6관) — tBookList 벤더(부산 계열), manage_code. 6/6 매핑.
  "library.gyeongju.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "147042": "MB", // 감포도서관
      "147044": "MC", // 단석도서관
      "147025": "MA", // 경주시립도서관
      "147120": "MG", // 송화도서관
      "147026": "MF", // 중앙도서관
      "147052": "MD", // 칠평도서관
    };
    return (
      `https://library.gyeongju.go.kr/?page_id=search_booklist&mode=tBookList&collection=tot_book` +
      `&search_field1=IAL&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code", libCode)
    );
  },

  // 여주(경기, 8관) — plusSearch /web/menu/10036/, searchLibraryArr, searchWord. 8/8.
  "www.yjlib.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "741094": "MD", // 북내작은도서관
      "141177": "MC", // 산북작은도서관
      "141641": "MH", // 여주기적의도서관
      "141615": "MG", // 여주시립금사도서관
      "141600": "MF", // 여주시립대신도서관
      "141054": "MB", // 여주시립세종도서관
      "141331": "MA", // 여주시립여주도서관
      "141586": "ME", // 점동도서관
    };
    return (
      `https://www.yjlib.go.kr/web/menu/10036/program/30001/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchField=ALL&searchWord=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 충주(충북, 6관) — plusSearch /web/menu/10041/, searchLibraryArr, searchWord. 6/6.
  "lib.chungju.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "143135": "MD", // 서충주도서관
      "143011": "MA", // 충주시립도서관
      "143130": "MC", // 충주시립어린이청소년도서관
      "143121": "SH", // 충주시립엄정꿈터도서관
      "143026": "BR", // 충주시립호암도서관
      "143140": "SK", // 충주시립호암어린이도서관
    };
    return (
      `https://lib.chungju.go.kr/web/menu/10041/program/30001/searchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchField=ALL&searchWord=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 안성(경기, 11관) — 정보나루 homepage는 www.apl.go.kr이나 검색은 anseong.go.kr.
  // 필터 param이 branchId(숫자). 11/11 매핑. branchId 1 vs 2 차등 실측.
  "www.apl.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141168": "1",  // 중앙도서관
      "141289": "2",  // 보개도서관
      "141294": "3",  // 일죽도서관
      "141292": "4",  // 송정작은도서관
      "141291": "5",  // 부영작은도서관
      "141295": "6",  // 죽산작은도서관
      "141293": "7",  // 풍림작은도서관(주은풍림)
      "141213": "8",  // 태산작은도서관
      "141296": "9",  // 삼죽작은도서관
      "141290": "10", // 공도도서관
      "141547": "11", // 진사도서관
    };
    return (
      `https://www.anseong.go.kr/library/search/search.do?mId=0101010100&searchKeyType=K` +
      `&searchType=ALL&searchTxt=${encodeURIComponent(title)}` +
      facetParam(map, "branchId", libCode)
    );
  },

  // 익산(7관) — site/search bookSearch.do 벤더(광주교육청 계열), manage_code.
  // /gm/ 경로. 7/7 매핑, 결과 69건·MA≠MB 차등 실측. (최종조사 Network 캡처)
  "lib.iksan.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "145153": "MB", // 금마도서관
      "145024": "MA", // 마동도서관
      "145095": "MO", // 모현도서관
      "145116": "BU", // 부송도서관
      "145042": "BR", // 영등도서관
      "145154": "MC", // 유천도서관
      "145144": "HW", // 황등도서관
    };
    return (
      `https://lib.iksan.go.kr/gm/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
      `&search_type=detail&search_item=search_title&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code", libCode)
    );
  },

  // 하남(8관) — plusSearch이나 홈 검색은 POST. 실검색 URL은 kolaseek GET
  // 엔드포인트(Network 캡처로 발견). searchLibraryArr, 8/8 매핑. MB≠MA 차등.
  "www.hanamlib.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "141171": "MB", // 나룰도서관
      "141579": "MC", // 덕풍도서관
      "141608": "ME", // 디지털도서관
      "141622": "MS", // 미사도서관
      "141607": "MD", // 세미도서관
      "141046": "MA", // 신장도서관
      "141636": "MF", // 위례도서관
      "741725": "IG", // 일가도서관
    };
    return (
      `https://www.hanamlib.go.kr/kolaseek/search/plusSearchResultList.do` +
      `?searchType=SIMPLE&searchCategory=ALL&searchKey=ALL&searchKeyword=${encodeURIComponent(title)}` +
      facetParam(map, "searchLibraryArr", libCode)
    );
  },

  // 음성(4관) — front/index.php 벤더, 필터 param이 manage_code[](배열)이 핵심
  // (사용자 제보 URL로 확정). CSRFToken은 불필요(있으나 없으나 결과 동일 실측).
  // 4/4 매핑. 홍학의 자리+정해연 렌더링·MF≠MA 차등 확인.
  "lib.eumseong.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "143124": "MC", // 감곡도서관
      "143024": "MA", // 대소도서관
      "143138": "MF", // 맹동혁신도서관
      "143134": "ME", // 삼성도서관
    };
    return (
      `https://lib.eumseong.go.kr/front/index.php?g_page=search&m_page=search01` +
      `&search_type=NORMAL&book_type%5B%5D=BOOK&display=10` +
      `&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code%5B%5D", libCode)
    );
  },

  // 광주교육청(6관) — 정보나루 homepage는 lib.gen.go.kr이나 검색은 lib.jge.go.kr
  // (site/search bookSearch.do 벤더, manage_code). 딥링크 렌더링(책+저자) 확인,
  // manage_code X≠Y 스코핑 실측. 4/6 매핑(학생독립운동기념회관·금호평생교육관은
  // 포털 facet 미노출 → 전관 폴백).
  "lib.gen.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "124002": "MD", // 중앙도서관
      "124011": "MC", // 광주학생교육문화회관
      "129221": "MF", // 중앙도서관 분관 최상준도서관
      "124001": "ME", // 송정다가치문화도서관
    };
    return (
      `https://lib.jge.go.kr/jungang/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
      `&search_type=detail&search_item=search_title&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code", libCode)
    );
  },

  // 평창(4관) — site/search bookSearch.do 벤더, manage_code. 3/4 매핑(봉평 미등록
  // → 전관 폴백). www.pc.go.kr는 평창군청 도메인이나 정보나루 평창관 전용.
  "www.pc.go.kr": (title, _homepage, libCode) => {
    const map: Record<string, string> = {
      "142115": "MH", // 대관령도서관
      "142042": "MA", // 대화도서관
      "142036": "MB", // 진부도서관
      // 142097 봉평 — 포털 facet에 없음 → 전관 검색 폴백
    };
    return (
      `https://www.pc.go.kr/lib/main/site/search/bookSearch.do?cmd_name=bookandnonbooksearch` +
      `&search_type=detail&use_facet=N&search_item=search_title&search_txt=${encodeURIComponent(title)}` +
      facetParam(map, "manage_code", libCode)
    );
  },
};

/**
 * hostname 접미사 → 검색 URL 빌더. 충남교육청처럼 교육지원청별 서브도메인
 * (hslib·cle·gjlib·…)이 수십 개지만 검색 경로가 완전히 동일한 경우 —
 * 각 도서관 homepage의 host를 그대로 살려서 빌드.
 */
/**
 * 충남교육청 서브도메인 → 자기 관 manageCode.
 * [2026-07-20 2차 수정] manageCode=MS 일률 적용은 오류였음 — MS는 홍성
 * 코드라 유구 등 모든 사이트에서 홍성 결과만 나왔음 (사용자 제보).
 * 19개 서브도메인의 검색 페이지에서 checked 기본값을 전수 수집했고,
 * 코드별 필터링은 결과 등록번호 접두어(E+관코드: EMF·EMU·EMG)로 검증.
 */
const CNE_MANAGE_CODES: Record<string, string> = {
  "cle.cne.go.kr": "MB", // 충남교육청평생교육원
  "chsl.cne.go.kr": "MA", // 학생교육문화원
  "shlib.cne.go.kr": "ME", // 천안 성환도서관
  "gjlib.cne.go.kr": "MF", // 공주도서관
  "yglib.cne.go.kr": "MG", // 공주 유구도서관
  "brlib.cne.go.kr": "MH", // 보령도서관
  "uclib.cne.go.kr": "MJ", // 보령 웅천도서관
  "aslib.cne.go.kr": "MK", // 아산도서관
  "csbl.cne.go.kr": "MD", // 서부평생교육원
  "hmlib.cne.go.kr": "ML", // 서산 해미도서관
  "cnbl.cne.go.kr": "MC", // 남부평생교육원
  "djlib.cne.go.kr": "MM", // 당진도서관
  "kslib.cne.go.kr": "MN", // 금산도서관
  "bylib.cne.go.kr": "MP", // 부여도서관
  "sclib.cne.go.kr": "MQ", // 서천도서관
  "cylib.cne.go.kr": "MR", // 청양도서관
  "hslib.cne.go.kr": "MS", // 홍성도서관
  "yslib.cne.go.kr": "MT", // 예산도서관
  "talib.cne.go.kr": "MU", // 태안도서관
};

const SUFFIX_TEMPLATES: Record<string, (host: string, title: string) => string> = {
  // 충남교육청(*.cne.go.kr) — [2026-07-20 사용자 제보 홍성 URL에서 역산]
  // menuId는 없어도 동작 확인. 관 코드를 알면 그 관만, 목록에 없는
  // 서브도메인은 manageCode 생략 → 충남 전체 통합검색(그 관 포함)으로 폴백.
  ".cne.go.kr": (host, title) => {
    const mc = CNE_MANAGE_CODES[host];
    return (
      `https://${host}/api/srch/bookSearch.do?` +
      (mc ? `manageCode=${mc}&` : "") +
      `searchCondition=ALL&searchTxt=${encodeURIComponent(title)}`
    );
  },
};

/**
 * [2026-07-22 신설] 대전 u-library.kr 소장처(도서관) facet 코드.
 * 정보나루 libCode → u-library lmt0 값(H코드). 소장처 필터에서 실측 추출한
 * 코드↔관명 매핑을 정보나루 25.json 관과 대조해 확정(26/27관, 성남작은도서관만
 * 통합 OPAC 미참여라 제외 → 그 관은 전체검색으로 폴백).
 * 딥링크 검증(콜드스타트·_csrf불요·필터 스코핑): title `[소장처:OO]` 확인.
 */
const DAEJEON_HCODE: Record<string, string> = {
  "125008": "H0000003", // 가오도서관
  "143064": "H0000008", // 무지개도서관
  "125006": "H0000004", // 용운도서관
  "130008": "H0000010", // 자양도서관
  "130004": "H0000006", // 판암도서관
  "130009": "H0000009", // 홍도도서관
  "125002": "H0000024", // 대전학생교육문화원
  "125001": "H0000025", // 산성어린이도서관
  "125003": "H0000001", // 한밭도서관
  "125010": "H0000014", // 가수원도서관
  "125004": "H0000011", // 갈마도서관
  "130007": "H0000017", // 대전 서구 어린이도서관(서구어린이)
  "130006": "H0000012", // 둔산도서관
  "130028": "H0000027", // 월평도서관
  "130023": "H0000030", // 관평도서관
  "130022": "H0000020", // 구암도서관
  "125013": "H0000019", // 구즉도서관
  "130012": "H0000015", // 노은도서관
  "130026": "H0000026", // 원신흥도서관
  "125007": "H0000016", // 유성도서관
  "12500701": "H0000013", // 유성도서관 엑스포분관(유성엑스포)
  "130031": "H0000031", // 전민도서관
  "130010": "H0000018", // 진잠도서관
  "130030": "H0000029", // 석봉도서관
  "130013": "H0000023", // 송촌도서관
  "125005": "H0000022", // 안산도서관
  // 730165 성남작은도서관 — 대전공공도서관 통합 OPAC 미참여 → 전체검색 폴백
};

/**
 * 시도 단위 통합 포털 (hostname 매핑이 안 될 때의 폴백).
 * 대전처럼 관별 homepage 도메인은 제각각이지만 시 전체를 검색하는 통합
 * 포털이 따로 있는 경우 — region 코드(units 앞 2자리)로 연결.
 * libCode를 받으면 소장처 facet으로 그 관만 지정(대전). 코드 없거나 매핑
 * 없으면 전체검색으로 폴백(악화 없음).
 */
const REGION_TEMPLATES: Record<string, (title: string, libCode?: string) => string> = {
  // [실측 확인 2026-07-19 — 2단 프로브] 부산 도서관포털 통합자료검색.
  // 렌더링 확인: 전 구·군 선택지 + 소장처별 결과 915건 — 부산 전역 맞음.
  // manageCode 전체 나열은 실제 검색 실행 시 폼이 만드는 URL 그대로.
  "21": (title) =>
    `https://library.busan.go.kr/portal/intro/search/indexForAll.do?menu_idx=93` +
    `&booktype=BOOKANDNONBOOK&mode=tBookList&page_id=result&viewPage=1` +
    `&manageCode=BJ%2CBG%2CAX%2CBV%2CCA%2CBZ%2CKP%2CJG%2CAP%2CAF%2CKF%2CHN%2CJV%2CHR%2CJJ%2CHQ%2CJN%2CJP%2CJS%2CJQ%2CJU%2CJR%2CKA%2CKD%2CJM%2CKE%2CKG%2CKK%2CKL%2CAC%2CAT%2CAZ%2CBD%2CAL%2CBR%2CGQ%2CKS%2CBK%2CAN%2CBP%2CGL%2CBH%2CAJ%2CKN%2CHS%2CHT%2CHU%2CJW%2CAV%2CAY%2CAO%2CHX%2CAB%2CBN%2CAU%2CBE%2CGP%2CJX%2CJY%2CBL%2CAD%2CAG%2CBA%2CGB%2CGC%2CGD%2CGE%2CGF%2CGG%2CGH%2CGJ%2CJZ%2CAQ%2CJT%2CGM%2CGN%2CAS%2CAH%2CBT%2CFR%2CJK%2CJL%2CAW%2CBS%2CHY%2CHZ%2CJD%2CJE%2CJB%2CJC%2CKB%2CKC%2CJA%2CAR%2CBQ%2CCB%2CBC%2CAE%2CGS%2CGT%2CGU%2CGW%2CGY%2CGZ%2CHA%2CHC%2CHD%2CHE%2CHG%2CHH%2CHJ%2CAA%2CFQ%2CFE%2CFF%2CFG%2CFH%2CFJ%2CFK%2CFL%2CFM%2CFN%2CFP%2CKQ%2CAK%2CFA%2CFB%2CFC%2CFD%2CAM%2CBB%2CFS%2CFT%2CFU%2CFV%2CFW%2CFX%2CFY%2CFZ%2CGA%2CJH%2CKT` +
    `&title=${encodeURIComponent(title)}`,

  // [실측 확인 2026-07-19 — 사용자 제보 URL] 대전 통합도서관(u-library.kr).
  // 이천 작은도서관과 동일 벤더(search/tot/result). 렌더링 확인: 소장처
  // 필터에 가수원·가오·갈마·관평·구암 등 29곳(한밭·유성·대덕 포함) —
  // 대전 전역 통합검색 맞음. 두 책 교차검증 통과.
  // [2026-07-22] libCode가 있으면 소장처 facet(lmt0=H코드)으로 그 관만 지정.
  "25": (title, libCode) => {
    const base =
      `https://www.u-library.kr/search/tot/result?st=KWRD&si=TOTAL&q=${encodeURIComponent(title)}`;
    const h = libCode ? DAEJEON_HCODE[libCode] : undefined;
    // lmtsn=000000000006/lmtst=OR는 소장처 facet 슬롯 상수(실측 URL에서 확인)
    return h ? `${base}&lmt0=${h}&lmtsn=000000000006&lmtst=OR` : base;
  },
};

/**
 * 비서울 도서관의 검색결과 딥링크. 도서관 homepage의 hostname이 검증된
 * 도메인이면 검색결과 URL, 없으면 시도 통합 포털, 그것도 없으면 undefined
 * (호출부가 homepage로 폴백).
 */
export function buildNationwidePortalSearchUrl(
  homepage: string | undefined,
  title: string,
  region?: string,
  libCode?: string
): string | undefined {
  if (!title) return undefined;
  try {
    const host = homepage ? new URL(homepage).hostname : undefined;
    const byHost = host ? PORTAL_TEMPLATES[host]?.(title, homepage!, libCode) : undefined;
    const bySuffix =
      byHost ??
      (host
        ? Object.entries(SUFFIX_TEMPLATES).find(([suffix]) =>
            host.endsWith(suffix)
          )?.[1](host, title)
        : undefined);
    return bySuffix ?? (region ? REGION_TEMPLATES[region]?.(title, libCode) : undefined);
  } catch {
    return region ? REGION_TEMPLATES[region]?.(title, libCode) : undefined;
  }
}
