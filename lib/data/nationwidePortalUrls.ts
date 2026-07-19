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
