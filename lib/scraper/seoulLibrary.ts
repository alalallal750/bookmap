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
  console.log("[seoulLibrary] CODE VERSION MARKER: v3-cookie-check-20260618");

  const id = generateRequestId();
  const dbnumParam = EBOOK_DBNUMS.join("%20");

  console.log("[seoulLibrary] generated id:", id);

  // 1단계: 검색결과 페이지 요청. 응답에 담긴 쿠키(WL_PCID, JSESSIONID, ls_session)를
  // 이후 check/all_result 요청에도 그대로 들고 가야 서버가 "같은 검색"으로 인식함
  // (실측으로 확인됨, 2026-06-18).
  const stage1Url =
    `${BASE_URL}/index.php/result` +
    `?id=${id}` +
    `&category1=${CATEGORY[category]}` +
    `&category2=0&category3=0` +
    `&text1=${encodeURIComponent(query)}&text2=&text3=` +
    `&op=0&op2=0&year1=&year2=` +
    `&dbnum=${dbnumParam}` +
    `&display=30&recstart=1&sort=rel`;

  let cookie = "";
  try {
    const stage1Res = await fetch(stage1Url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] stage1 status:", stage1Res.status);
    cookie = extractCookies(stage1Res);
    console.log("[seoulLibrary] cookie acquired:", cookie ? "yes" : "no");
  } catch (e) {
    console.log("[seoulLibrary] stage1 fetch failed:", e);
    return [];
  }

  if (!cookie) {
    console.log("[seoulLibrary] no cookie - aborting (서버가 쿠키 없이는 후속 요청을 거부함)");
    return [];
  }

  // 서버 자체 설정값(ajax/config/all 응답의 config_id 128,129) 확인 결과:
  //   able_all_result_first = "1" (켜짐), all_result_first_delay = "3" (3초)
  // → 검색 시작 후 결과를 모으는 데 최소 3초가 걸리도록 서버가 설계되어 있음.
  // 이 지연을 기다리지 않고 곧바로 check/all_result를 보내면 "File Load Failed" 응답을 받음
  // (실측 확인됨, 2026-06-18). 그래서 1단계 직후 3초 대기를 추가함.
  console.log("[seoulLibrary] waiting 3s (server config: all_result_first_delay)");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const commonHeaders = {
    "User-Agent": "Mozilla/5.0",
    Cookie: cookie,
    "X-Requested-With": "XMLHttpRequest",
    Referer: stage1Url,
  };

  // 2단계: check로 각 도서관(dbnum) 검색이 완료됐는지 확인. 25개 구를 동시에 조회하는 구조라
  // 즉시 다 끝나지 않을 수 있어, 짧게 대기하며 최대 8회까지 재확인(실측 기반 추정치, 필요시 조정).
  const checkUrl = `${BASE_URL}/index.php/ajax/engine/check?id=${id}`;
  const MAX_CHECK_ATTEMPTS = 8;
  const CHECK_INTERVAL_MS = 600;

  for (let attempt = 1; attempt <= MAX_CHECK_ATTEMPTS; attempt++) {
    try {
      const checkRes = await fetch(checkUrl, {
        signal: AbortSignal.timeout(8000),
        headers: commonHeaders,
      });
      const checkXml = await checkRes.text();
      console.log(`[seoulLibrary] check attempt ${attempt} status:`, checkRes.status);
      console.log(`[seoulLibrary] check attempt ${attempt} raw:`, checkXml.slice(0, 500));

      const pending = (checkXml.match(/status="0"/g) ?? []).length;
      const done = (checkXml.match(/status="1"/g) ?? []).length;
      console.log(`[seoulLibrary] check attempt ${attempt} done=${done} pending=${pending}`);

      // done과 pending이 둘 다 0이면 "이미 다 끝남"이 아니라 "아직 응답이 비정상/시작 전"인
      // 경우일 수 있으므로(실측으로 확인됨, 2026-06-18), 그런 경우는 완료로 간주하지 않고 재시도함.
      // 실제로 완료로 봐야 하는 조건은 done이 1개 이상 있으면서 pending이 0인 경우로 한정.
      if (done > 0 && pending === 0) break;
    } catch (e) {
      console.log(`[seoulLibrary] check attempt ${attempt} failed:`, e);
    }

    if (attempt < MAX_CHECK_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
  }

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