/**
 * 서울도서관 통합검색 (meta.seoul.go.kr/libseoul) 기반 전자책 검색
 *
 * handoff v3 5장(API 구조), 6장(대출가능 해석 규칙), 7장(판본 묶기 기준) 참조
 *
 * 흐름 (2026-06-18 실측으로 확정 — handoff 문서의 "1·2단계" 추정과 다름, 중간에 check 단계가 더 있었음):
 *   1. id 발급 + 검색결과 페이지 요청 (GET .../index.php/result) → 응답 쿠키 확보
 *   2. check로 각 도서관(dbnum) 검색 완료 여부 확인, 미완료 시 잠시 대기 후 재확인 (GET .../index.php/ajax/engine/check)
 *   3. 실제 XML 데이터 요청 (GET .../index.php/ajax/engine/all_result)
 *   4. 도서관별(dbnum) 해석 규칙 적용해 대출가능 여부 판단
 *   5. 강남구는 상세페이지 추가조회 필요 (XML만으로 판단 불가)
 *   6. 제목+저자 완전일치 기준으로 같은 책 묶기 (+ 출판일 보조기준)
 *
 * 중요: 1~3단계는 모두 같은 쿠키(WL_PCID, JSESSIONID, ls_session)를 들고 가야 함.
 * 쿠키 없이 보내면 "No search has been found in that ID" 오류 응답을 받음(실측 확인됨).
 *
 * [2026-06-19 추가] 방향 A 실험: 서버 응답 헤더에서 JSESSIONID/WL_PCID를 못 받는 문제(handoff v4 5-3장)에
 * 대해, 브라우저가 자바스크립트로 직접 만들어 쓰는 값일 가능성이 높다는 가설 하에, 우리가 비슷한 형식으로
 * 직접 만들어서 쿠키에 끼워 넣어보는 실험. 형식만 맞으면 서버가 받아주는지(=새 세션을 발급해주는지)를
 * 확인하는 단계이며, 실패하면 방향 B(wl6.js 분석)로 넘어갈 예정.
 */

import * as cheerio from "cheerio";
import { EbookBook, EbookLibraryEntry, SearchCategory } from "@/types";

const BASE_URL = "https://meta.seoul.go.kr/libseoul";

// handoff 3-1장: 전자책도서관 7곳 (서울시전자도서관 103291은 통합검색 미지원으로 제외)
const EBOOK_LIBRARIES: Record<string, string> = {
  "44911": "강남구립전자도서관",
  "44891": "구로구립전자도서관",
  "45011": "금천구립전자도서관",
  "45351": "동대문구립전자도서관",
  "45051": "마포구립전자도서관",
  "45111": "서초구립전자도서관",
  "103301": "서울시육아종합지원센터",
};
const EBOOK_DBNUMS = Object.keys(EBOOK_LIBRARIES);

// handoff 5-1장: category1 값
const CATEGORY: Record<SearchCategory, string> = {
  title: "1", // 서명 검색
  author: "4", // 저자 검색
};

/**
 * id 생성 — handoff 5-1장에는 "17자리, 현재시각 기반"으로 추정 기록되어 있었으나,
 * 실측 결과(2026-06-18) 틀린 추정으로 확인됨.
 *
 * 실제 샘플 2건 비교로 확인된 패턴:
 *   178178598137071  (15자리)
 *   178178604389597  (15자리)
 * 앞 10자리가 초 단위 유닉스 타임스탬프와 일치(두 샘플의 차이가 실제 요청 시간차와 일치).
 * 뒤 5자리는 정확한 의미 불명(밀리초였다면 3자리여야 하나 5자리로 확인됨) — 무작위값으로 채움.
 * = 10자리(초 단위 타임스탬프) + 5자리(임의 숫자) = 15자리
 */
function generateRequestId(): string {
  const seconds = Math.floor(Date.now() / 1000).toString(); // 10자리
  const rand = Math.floor(10000 + Math.random() * 90000).toString(); // 5자리
  return seconds + rand;
}

/**
 * [2026-06-19 추가] 방향 A 실험용 — 무작위 영문자+숫자 문자열 생성 (JSESSIONID용)
 */
function randomAlphaNum(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * [2026-06-19 추가] 방향 A 실험용 — 가짜 WL_PCID 생성
 * 실측 패턴: 17817908762201261577718 (10자리 초단위 타임스탬프 + 13자리 임의숫자 = 23자리)
 */
function generateFakeWlPcid(): string {
  const seconds = Math.floor(Date.now() / 1000).toString(); // 10자리
  let rand = "";
  for (let i = 0; i < 13; i++) {
    rand += Math.floor(Math.random() * 10).toString();
  }
  return seconds + rand;
}

/**
 * [2026-06-19 추가] 방향 A 실험용 — 가짜 JSESSIONID 생성
 * 실측 패턴: gosZtIIFDoxcIGCYkkvUxLTRm5ytjWsYIlBivHVwDGWQ0NLLT2Kp7cOLlg4QG8g2.replibwas2_servlet_engine6
 * (64자 영문/숫자 + .replibwas2_servlet_engine6 접미사)
 */
function generateFakeJsessionId(): string {
  return `${randomAlphaNum(64)}.replibwas2_servlet_engine6`;
}

/**
 * fetch 응답의 Set-Cookie 헤더들을 모아서, 다음 요청에 그대로 보낼 수 있는
 * "Cookie: a=1; b=2" 형식의 문자열로 변환.
 *
 * 주의: 표준 fetch의 Headers.get("set-cookie")는 여러 개의 Set-Cookie를
 * 하나로 합쳐서 줄 수도, 못 가져올 수도 있어 런타임에 따라 동작이 다를 수 있음.
 * Node.js(Vercel 서버리스 함수) 환경에서는 getSetCookie()를 우선 사용하고,
 * 없으면 set-cookie 헤더를 그대로 사용하는 방식으로 안전하게 처리.
 */
function extractCookies(res: Response): string {
  // 최신 Node.js의 fetch는 Headers.getSetCookie()로 여러 쿠키를 배열로 줌
  const headersAny = res.headers as Headers & { getSetCookie?: () => string[] };
  let rawCookies: string[] = [];

  if (typeof headersAny.getSetCookie === "function") {
    rawCookies = headersAny.getSetCookie();
  } else {
    const single = res.headers.get("set-cookie");
    if (single) rawCookies = [single];
  }

  if (rawCookies.length === 0) return "";

  // 각 Set-Cookie 값에서 "이름=값" 부분만 추출 (Path, Expires 등 속성은 제외)
  const pairs = rawCookies
    .map((c) => c.split(";")[0].trim())
    .filter((c) => c.length > 0);

  return pairs.join("; ");
}

type RawRecord = {
  dbnum: string;
  dbname: string;
  title: string;
  url: string;
  author: string;
  publisher: string;
  date: string;
  isbn: string;
  image?: string;
  // 도서관별 원본 필드 (해석은 아래 resolveAvailability에서)
  state?: string; // 금천, 서초
  loan?: string; // 동대문, 구로, 서초(텍스트)
  loanKorean?: string; // 마포, 강남 ("대출" 한글 필드)
  reserveKorean?: string; // 강남 ("예약" 한글 필드)
};

/**
 * 전자책 검색 메인 함수
 */
export async function searchEbooks(
  query: string,
  category: SearchCategory
): Promise<EbookBook[]> {
  console.log("[seoulLibrary] CODE VERSION MARKER: v4-fake-cookie-20260619");

  const id = generateRequestId();
  const dbnumParam = EBOOK_DBNUMS.join("%20");

  console.log("[seoulLibrary] generated id:", id);

  // 검색 파라미터는 0단계(advanced_search)와 1단계(result)가 동일하게 사용함
  const searchQueryParams =
    `category1=${CATEGORY[category]}` +
    `&category2=0&category3=0` +
    `&text1=${encodeURIComponent(query)}&text2=&text3=` +
    `&op=0&op2=0&year1=&year2=` +
    `&dbnum=${dbnumParam}` +
    `&sort=rel`;

  // 0단계(신규, 실측으로 확인됨 2026-06-18): 실제 브라우저는 result 페이지로 곧장 가지 않고
  // advanced_search 페이지를 먼저 방문함(result 요청의 Referer가 advanced_search였음).
  // 이 단계를 건너뛰면 검색 자체가 서버에서 시작되지 않아 이후 check/all_result가
  // "File Load Failed"를 반환하는 것으로 추정됨.
  const advancedSearchUrl = `${BASE_URL}/index.php/advanced_search?${searchQueryParams}`;

  let cookie = "";
  try {
    const advRes = await fetch(advancedSearchUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] stage0 (advanced_search) status:", advRes.status);
    cookie = extractCookies(advRes);
    console.log("[seoulLibrary] stage0 cookie value:", cookie || "(empty)");
  } catch (e) {
    console.log("[seoulLibrary] stage0 fetch failed:", e);
    // 0단계 실패해도 1단계는 시도해볼 가치가 있음 (혹시 advanced_search 없이도 동작하는 경우 대비)
  }

  // [2026-06-19 추가] 방향 A 실험: 서버가 JSESSIONID/WL_PCID를 발급해주지 않으므로
  // (handoff v4 5-3장), 우리가 직접 비슷한 형식으로 만들어 끼워 넣어본다.
  // 이미 서버가 준 쿠키(ls_session 등)가 있다면 그건 유지하고, 없는 두 개만 추가.
  const hasJsessionId = cookie.includes("JSESSIONID=");
  const hasWlPcid = cookie.includes("WL_PCID=");

  const fakeParts: string[] = [];
  if (!hasJsessionId) {
    const fakeJsessionId = generateFakeJsessionId();
    console.log("[seoulLibrary] FAKE COOKIE injected - JSESSIONID:", fakeJsessionId);
    fakeParts.push(`JSESSIONID=${fakeJsessionId}`);
  }
  if (!hasWlPcid) {
    const fakeWlPcid = generateFakeWlPcid();
    console.log("[seoulLibrary] FAKE COOKIE injected - WL_PCID:", fakeWlPcid);
    fakeParts.push(`WL_PCID=${fakeWlPcid}`);
  }

  if (fakeParts.length > 0) {
    cookie = cookie ? `${fakeParts.join("; ")}; ${cookie}` : fakeParts.join("; ");
  }
  console.log("[seoulLibrary] cookie value after fake-injection:", cookie || "(empty)");

  // 1단계: 검색결과 페이지 요청. id를 포함해서 보내고, 0단계 쿠키(+가짜 쿠키)를 이어서 사용.
  // Referer를 advanced_search로 지정해 실제 브라우저 흐름을 모방함.
  const stage1Url =
    `${BASE_URL}/index.php/result` +
    `?id=${id}` +
    `&${searchQueryParams}` +
    `&display=30&recstart=1`;

  try {
    const stage1Res = await fetch(stage1Url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(cookie ? { Cookie: cookie } : {}),
        Referer: advancedSearchUrl,
      },
    });
    console.log("[seoulLibrary] stage1 status:", stage1Res.status);
    const stage1Cookie = extractCookies(stage1Res);
    if (stage1Cookie) {
      // 서버가 진짜 쿠키를 새로 내려줬다면, 그 쪽이 우선이므로 합쳐줌
      // (단, 우리가 만든 가짜 값 중 서버가 안 건드린 것은 유지)
      console.log("[seoulLibrary] stage1 returned NEW cookie from server:", stage1Cookie);
      cookie = mergeCookies(cookie, stage1Cookie);
    }
    console.log("[seoulLibrary] cookie value after stage1:", cookie || "(empty)");
  } catch (e) {
    console.log("[seoulLibrary] stage1 fetch failed:", e);
    return [];
  }

  if (!cookie) {
    console.log("[seoulLibrary] no cookie - aborting (서버가 쿠키 없이는 후속 요청을 거부함)");
    return [];
  }

  // [임시 검증 코드 2026-06-18] 시크릿 모드 캡처에서는 check/3초 대기 없이
  // result 직후 즉시 all_result를 호출해도 성공했음. 이 가설을 검증하기 위해
  // 일시적으로 check와 대기 로직을 건너뛰고 곧바로 all_result를 호출함.
  console.log("[seoulLibrary] TEMP: skipping check/delay, calling all_result immediately");

  const commonHeaders = {
    "User-Agent": "Mozilla/5.0",
    Cookie: cookie,
    "X-Requested-With": "XMLHttpRequest",
    Referer: stage1Url,
  };

  // 3단계: 실제 XML 데이터 요청 (같은 쿠키 사용)
  const stage2Url =
    `${BASE_URL}/index.php/ajax/engine/all_result` +
    `?id=${id}&display=20&recstart=1&reload=on&_=${Date.now()}`;

  let xml: string;
  try {
    const res = await fetch(stage2Url, {
      signal: AbortSignal.timeout(8000),
      headers: { ...commonHeaders, Accept: "text/xml, application/xml" },
    });
    console.log("[seoulLibrary] stage2 status:", res.status);
    if (!res.ok) return [];
    xml = await res.text();
    console.log("[seoulLibrary] stage2 xml length:", xml.length);
    console.log("[seoulLibrary] stage2 xml preview:", xml.slice(0, 1500));
  } catch (e) {
    console.log("[seoulLibrary] stage2 fetch failed:", e);
    return [];
  }

  const rawRecords = parseXml(xml);
  console.log("[seoulLibrary] parsed records count:", rawRecords.length);
  if (rawRecords.length === 0) return [];

  // 도서관별 해석 규칙 적용 (강남구는 비동기 상세조회 필요)
  const entries = await Promise.all(
    rawRecords.map((r) => resolveAvailability(r))
  );

  // 판본 묶기
  return groupBooks(
    rawRecords.map((r, i) => ({ raw: r, entry: entries[i] })).filter((x) => x.entry !== null) as {
      raw: RawRecord;
      entry: EbookLibraryEntry;
    }[]
  );
}

/**
 * [2026-06-19 추가] 방향 A 실험용 — 기존 쿠키 문자열과 서버가 새로 내려준 쿠키 문자열을 합침.
 * 같은 이름의 쿠키가 있으면 서버가 새로 내려준 값(나중 것)이 우선됨.
 */
function mergeCookies(oldCookie: string, newCookie: string): string {
  const map = new Map<string, string>();

  const parse = (str: string) => {
    str
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return;
        const name = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        map.set(name, value);
      });
  };

  parse(oldCookie);
  parse(newCookie); // 나중에 덮어써서 새 값이 우선되게 함

  return Array.from(map.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** XML 파싱 — handoff 5-2장 구조 참조 */
function parseXml(xml: string): RawRecord[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const records: RawRecord[] = [];

  $("record").each((_: number, el: any) => {
    const dbnum = $(el).attr("dbnum") ?? "";
    const dbname = $(el).attr("dbname") ?? "";

    // 우리가 요청한 7개 전자도서관 외의 결과는 무시 (혹시 서버가 다른 것도 같이 줄 경우 대비)
    if (!EBOOK_DBNUMS.includes(dbnum)) return;

    const field = (name: string) =>
      $(el).find(`field[name="${name}"] content`).first().text().trim();
    const fieldUrl = (name: string) =>
      $(el).find(`field[name="${name}"] url`).first().text().trim();

    const title = field("TITLE");
    if (!title) return;

    records.push({
      dbnum,
      dbname,
      title,
      url: fieldUrl("TITLE"),
      author: field("Author"),
      publisher: field("Publication"),
      date: field("Date"),
      isbn: field("ISBN"),
      image: field("Image") || undefined,
      state: field("State") || undefined,
      loan: field("Loan") || undefined,
      loanKorean: field("대출") || undefined,
      reserveKorean: field("예약") || undefined,
    });
  });

  return records;
}

/**
 * 도서관별 대출가능 해석 — handoff 6장 표 그대로 구현
 * 반환값이 null이면 "해석 불가/실패"로 간주해 결과에서 제외
 */
async function resolveAvailability(r: RawRecord): Promise<EbookLibraryEntry | null> {
  const libraryName = EBOOK_LIBRARIES[r.dbnum] ?? r.dbname;

  switch (r.dbnum) {
    case "45011": {
      // 금천 — State 텍스트 그대로 판단
      const available = (r.state ?? "").includes("대출가능");
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.state };
    }

    case "45111": {
      // 서초 — Loan 텍스트 그대로 판단
      const available = (r.loan ?? "").includes("대출가능");
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan };
    }

    case "45351":
    case "44891": {
      // 동대문, 구로 — Loan "분자/분모" 숫자비율, 분자 0이면 대출중
      const available = isRatioAvailable(r.loan);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan };
    }

    case "45051": {
      // 마포 — 대출(한글) "분자/분모" 숫자비율
      const available = isRatioAvailable(r.loanKorean);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loanKorean };
    }

    case "44911": {
      // 강남 — XML만으로 판단 불가, 상세페이지 추가조회 필요 (handoff 6-1장)
      return resolveGangnamAvailability(r, libraryName);
    }

    case "103301": {
      // 서울시육아종합지원센터 — handoff 9장: 표시 형식 미확인.
      // 확인 전까지는 안전하게 "판단 불가"로 처리해 결과에서 제외하지 않고,
      // available을 false로 두되 원문(loanInfo)은 그대로 보여줘 사용자가 직접 확인하게 함.
      const fallbackText = r.state ?? r.loan ?? r.loanKorean ?? "";
      return {
        dbnum: r.dbnum,
        libraryName,
        available: fallbackText.includes("대출가능"),
        url: r.url,
        loanInfo: fallbackText || "대출가능 여부 확인 필요(사이트에서 직접 확인해 주세요)",
      };
    }

    default:
      return null;
  }
}

/** "0/2" 같은 분자/분모 텍스트 — 분자가 0이면 대출중(false), 그 외 가능(true) */
function isRatioAvailable(text?: string): boolean {
  if (!text) return false;
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) > 0;
}

/**
 * 강남구 상세페이지 추가조회 — handoff 6-1장
 * 보유 - 대출 = 빌릴 수 있는 권수 (0보다 크면 대출가능)
 */
async function resolveGangnamAvailability(
  r: RawRecord,
  libraryName: string
): Promise<EbookLibraryEntry | null> {
  if (!r.url) return null;

  try {
    const res = await fetch(r.url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const ownedText = $("div.current span:contains('보유') strong").first().text().trim();
    const loanText = $("div.current span:contains('대출') strong").first().text().trim();

    const owned = parseInt(ownedText, 10);
    const loaned = parseInt(loanText, 10);
    if (Number.isNaN(owned) || Number.isNaN(loaned)) return null;

    const remaining = owned - loaned;
    return {
      dbnum: r.dbnum,
      libraryName,
      available: remaining > 0,
      url: r.url,
      loanInfo: `보유 ${owned} / 대출 ${loaned}`,
    };
  } catch {
    return null;
  }
}

/**
 * 판본 묶기 — handoff 7장
 * 1차 기준: 제목 완전일치 + 저자 일치 (띄어쓰기 차이는 무시)
 * 2차 보조기준은 1차로 안 묶인 경우의 추가 판단용이나, 여기서는 안전하게 1차만 적용
 * (금천구는 Date 필드 자체가 없어 2차 기준을 적용하면 금천만 따로 떨어질 위험이 있어,
 *  1차 기준만 적용하는 게 "정확도 우선" 원칙에 더 부합함)
 */
function groupBooks(items: { raw: RawRecord; entry: EbookLibraryEntry }[]): EbookBook[] {
  const normalize = (s: string) => s.replace(/\s+/g, "");

  const groups = new Map<string, EbookBook>();

  for (const { raw, entry } of items) {
    const key = `${normalize(raw.title)}__${normalize(raw.author)}`;
    const existing = groups.get(key);

    if (existing) {
      // 같은 도서관이 중복으로 들어오는 경우 방지
      if (!existing.libraries.some((l: EbookLibraryEntry) => l.dbnum === entry.dbnum)) {
        existing.libraries.push(entry);
      }
      if (!existing.coverImage && raw.image) existing.coverImage = raw.image;
    } else {
      groups.set(key, {
        title: raw.title,
        author: raw.author,
        publisher: raw.publisher || undefined,
        publishDate: raw.date || undefined,
        coverImage: raw.image,
        libraries: [entry],
      });
    }
  }

  return Array.from(groups.values());
}