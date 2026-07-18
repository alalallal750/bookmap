/**
 * lib/api/data4library.ts
 *
 * 도서관 정보나루(data4library.kr) Open API 클라이언트.
 *
 * [2026-07-09 신규 — 정보나루 기본선 아키텍처] 종이책 검색에서 스크래핑이
 * 불가능한 구(금천·송파·성북: ISBN 미제공)와 타임아웃으로 실패한 구를
 * 정보나루 데이터로 대체하기 위한 모듈. 흐름:
 *   1. libSrchByBook(ISBN, 서울) → 이 책을 소장한 도서관 libCode 집합
 *   2. 대상 구의 참여관(naruLibraries.ts) 중 소장관에만 bookExist 호출
 *      → 소장여부·대출가능여부(전일 기준)
 *
 * 주의사항:
 *   - bookExist의 대출가능은 "조회일 기준 전날" 상태 (매뉴얼 명시).
 *     권수(N/M)는 제공하지 않음 → PhysicalLibrary.availableCount를
 *     채우지 않는 것으로 출처를 구분함 (UI가 "가능" 표기로 처리).
 *   - 일일 호출 한도 기본 500회. fetch에 revalidate 캐시(6시간)를 걸어
 *     같은 책+도서관 조합의 반복 조회를 흡수 — bookExist가 전일 기준이라
 *     하루 안의 캐시는 정보 손실이 없음.
 *   - libSrchByBook은 월 단위 병합 데이터라 최근 입고분이 누락될 수
 *     있음. 대상 구들은 현재 결과 0건이므로 그래도 순이득 (2026-07-09
 *     논의). 신간 보완(구 전체 bookExist 직접 호출)은 사용량 데이터
 *     확인 후 검토하기로 보류.
 */

const BASE_URL = "http://data4library.kr/api";
const TIMEOUT_MS = 10000;

// bookExist가 전일 기준이라 6시간 캐시는 무손실. Vercel 데이터 캐시는
// best-effort라 히트율 100%는 아니지만 용도가 호출량 절약이므로 충분.
const REVALIDATE_SECONDS = 21600;

export type NaruHolding = {
  libCode: string;
  hasBook: boolean;
  loanAvailable: boolean;
};

function getAuthKey(): string | undefined {
  return process.env.DATA4LIB_KEY;
}

/** 사용량 파악용 — Vercel 로그에서 "[naru-usage]"로 검색 */
export function logNaruUsage(context: string, callCount: number): void {
  console.log(`[naru-usage] ${context} | 호출 ${callCount}회`);
}

// [2026-07-10 추가] 일일 한도 도달 알림 — 같은 서버 인스턴스에서 하루 한
// 번만 발송 (서버리스라 인스턴스마다 최대 1회씩은 올 수 있음, 감수).
let lastLimitAlertDate = "";

/**
 * 한도 초과 에러를 감지하면 "[naru-limit]" 로그를 남기고,
 * NARU_ALERT_WEBHOOK 환경변수가 있으면 그 주소로 알림을 쏜다.
 * Slack(text)·Discord(content) 웹훅 둘 다 받는 payload. 실패해도 조용히
 * 무시 — 알림은 best-effort, 본 기능에 영향 주면 안 됨.
 *
 * [2026-07-11 수정] 실제 한도 초과 응답의 errCode는 "outOflimit"이고
 * 메시지는 "1일 500건 이상 요청 시 IP 등록이 필요합니다..."라서 "한도/
 * 초과/limit/exceed" 문구 매칭으로는 못 잡았음(실측으로 확인된 버그) —
 * errCode 필드를 직접 검사하도록 변경.
 */
function alertIfQuotaExceeded(errCode: string | undefined, errorText: string): void {
  if (errCode !== "outOflimit") return;
  console.log(`[naru-limit] 정보나루 일일 호출 한도 도달: ${errorText}`);

  const webhook = process.env.NARU_ALERT_WEBHOOK;
  if (!webhook) return;
  const today = new Date().toISOString().slice(0, 10);
  if (lastLimitAlertDate === today) return;
  lastLimitAlertDate = today;

  const message = `[지금빌려] 정보나루 API 일일 한도 도달 (${today}) — 송파·성북·금천·폴백 구 마커가 오늘 하루 표시되지 않을 수 있습니다. 에러: ${errorText}`;
  void fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, content: message }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

async function fetchNaruJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      console.log(`[naru] HTTP ${res.status}: ${url.replace(/authKey=[^&]+/, "authKey=***")}`);
      return null;
    }
    const json = await res.json();
    const r = json.response ?? json;
    if (r.error) {
      // 일일 한도 초과 등 — 에러 내용을 로그로 남기고 조용히 실패
      const errorText = JSON.stringify(r.error);
      console.log(`[naru] API error:`, errorText, r.errCode ? `(errCode: ${r.errCode})` : "");
      alertIfQuotaExceeded(r.errCode, errorText);
      return null;
    }
    return r;
  } catch (e) {
    console.log(`[naru] fetch 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 이 책(ISBN13)을 소장한 서울 지역 도서관의 libCode 집합.
 * 실패(키 없음·한도 초과·네트워크) 시 null — 호출부는 정보나루 경로를
 * 조용히 생략해야 함 (스크래핑 결과에는 영향 없음).
 */
export async function fetchHoldingLibCodes(isbn13: string): Promise<Set<string> | null> {
  const key = getAuthKey();
  if (!key) {
    console.log("[naru] DATA4LIB_KEY 없음 — 정보나루 경로 생략");
    return null;
  }

  const codes = new Set<string>();
  let pageNo = 1;
  let calls = 0;
  for (;;) {
    const url =
      `${BASE_URL}/libSrchByBook?authKey=${key}&isbn=${encodeURIComponent(isbn13)}` +
      `&region=11&pageNo=${pageNo}&pageSize=300&format=json`;
    const r = await fetchNaruJson(url);
    calls++;
    if (r === null) return pageNo === 1 ? null : codes; // 첫 페이지 실패면 전체 실패로
    const page = (r.libs ?? []).map((x: any) => x.lib ?? x);
    for (const lib of page) codes.add(String(lib.libCode));
    const numFound = Number(r.numFound ?? 0);
    if (codes.size >= numFound || page.length === 0) break;
    pageNo += 1;
  }
  logNaruUsage(`libSrchByBook isbn=${isbn13} 소장 ${codes.size}관`, calls);
  return codes;
}

/**
 * [2026-07-18 전국판] 이 책(ISBN13)을 소장한 "시군구 단위" 도서관 libCode
 * 집합 — libSrchByBook에 region+dtl_region을 걸어 시군구당 1~2회로 조회.
 *
 * 전국판 호출 절약 원칙: 선행 호출은 이 함수만 쓰고, bookExist는 사용자가
 * 마커를 탭할 때 온디맨드로만 호출한다(서울 폴백처럼 관 수만큼 미리 쏘면
 * 참여관 많은 지역에서 검색 1회가 한도의 5~10%를 소비 — 실측 근거는
 * 인수인계 문서 0장 2026-07-11 항목).
 *
 * 실패 시 null — 호출부는 그 시군구를 결과에서 생략 (부분 실패 허용).
 */
export async function fetchHoldingLibCodesByUnit(
  isbn13: string,
  dtlRegion: string
): Promise<Set<string> | null> {
  const key = getAuthKey();
  if (!key) {
    console.log("[naru] DATA4LIB_KEY 없음 — 정보나루 경로 생략");
    return null;
  }

  const region = dtlRegion.slice(0, 2);
  const codes = new Set<string>();
  let pageNo = 1;
  let calls = 0;
  for (;;) {
    const url =
      `${BASE_URL}/libSrchByBook?authKey=${key}&isbn=${encodeURIComponent(isbn13)}` +
      `&region=${region}&dtl_region=${encodeURIComponent(dtlRegion)}` +
      `&pageNo=${pageNo}&pageSize=300&format=json`;
    const r = await fetchNaruJson(url);
    calls++;
    if (r === null) return pageNo === 1 ? null : codes;
    const page = (r.libs ?? []).map((x: any) => x.lib ?? x);
    for (const lib of page) codes.add(String(lib.libCode));
    const numFound = Number(r.numFound ?? 0);
    if (codes.size >= numFound || page.length === 0) break;
    pageNo += 1;
  }
  logNaruUsage(`libSrchByBook unit=${dtlRegion} isbn=${isbn13} 소장 ${codes.size}관`, calls);
  return codes;
}

/**
 * 특정 도서관(libCode)의 소장·대출가능 여부 (전일 기준).
 * 실패 시 null — 호출부는 그 도서관만 결과에서 제외.
 */
export async function fetchBookExist(
  libCode: string,
  isbn13: string
): Promise<NaruHolding | null> {
  const key = getAuthKey();
  if (!key) return null;

  const url =
    `${BASE_URL}/bookExist?authKey=${key}&libCode=${encodeURIComponent(libCode)}` +
    `&isbn13=${encodeURIComponent(isbn13)}&format=json`;
  const r = await fetchNaruJson(url);
  if (r === null) return null;
  const result = r.result ?? r;
  if (result.hasBook === undefined) return null;
  return {
    libCode,
    hasBook: result.hasBook === "Y",
    loanAvailable: result.loanAvailable === "Y",
  };
}
