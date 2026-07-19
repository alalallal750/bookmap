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

/** hostname → 검색 URL 빌더. homepage는 대구처럼 경로에 구 식별자가 있는 통합 사이트용. */
type NationwideUrlBuilder = (title: string, homepage: string) => string | undefined;

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
};

/**
 * 시도 단위 통합 포털 (hostname 매핑이 안 될 때의 폴백).
 * 대전처럼 관별 homepage 도메인은 제각각이지만 시 전체를 검색하는 통합
 * 포털이 따로 있는 경우 — region 코드(units 앞 2자리)로 연결.
 */
const REGION_TEMPLATES: Record<string, (title: string) => string> = {
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
  "25": (title) =>
    `https://www.u-library.kr/search/tot/result?st=KWRD&si=TOTAL&q=${encodeURIComponent(title)}`,
};

/**
 * 비서울 도서관의 검색결과 딥링크. 도서관 homepage의 hostname이 검증된
 * 도메인이면 검색결과 URL, 없으면 시도 통합 포털, 그것도 없으면 undefined
 * (호출부가 homepage로 폴백).
 */
export function buildNationwidePortalSearchUrl(
  homepage: string | undefined,
  title: string,
  region?: string
): string | undefined {
  if (!title) return undefined;
  try {
    const host = homepage ? new URL(homepage).hostname : undefined;
    const byHost = host ? PORTAL_TEMPLATES[host]?.(title, homepage!) : undefined;
    return byHost ?? (region ? REGION_TEMPLATES[region]?.(title) : undefined);
  } catch {
    return region ? REGION_TEMPLATES[region]?.(title) : undefined;
  }
}
