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

  // 경기도교육청(11관)
  "lib.goe.go.kr": (title) =>
    `https://lib.goe.go.kr/lib/intro/search/index.do?menu_idx=10&booktype=BOOKANDNONBOOK` +
    `&search_text=${encodeURIComponent(title)}`,

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
};

/**
 * 비서울 도서관의 검색결과 딥링크. 도서관 homepage의 hostname이 검증된
 * 도메인이면 검색결과 URL, 아니면 undefined (호출부가 homepage로 폴백).
 */
export function buildNationwidePortalSearchUrl(
  homepage: string | undefined,
  title: string
): string | undefined {
  if (!homepage || !title) return undefined;
  try {
    const host = new URL(homepage).hostname;
    return PORTAL_TEMPLATES[host]?.(title, homepage);
  } catch {
    return undefined;
  }
}
