/**
 * 서울도서관 통합검색 (meta.seoul.go.kr/libseoul) 기반 전자책 검색
 *
 * handoff v3 5장(API 구조), 6장(대출가능 해석 규칙), 7장(판본 묶기 기준) 참조
 *
 * [2026-06-19 v5 변경] deploy 엔드포인트 발견 — default_search 방문 후 deploy 한 번
 * 호출하면 그 응답 자체에 검색 결과 XML이 들어있음을 확인함 (result/all_result/
 * JSESSIONID·WL_PCID 위조는 전부 불필요했음).
 *
 * [2026-06-19 v6 변경] dbnum을 7개 한꺼번에 넣어 deploy를 "1번" 호출하면, 7개 도서관
 * 중 그때그때 무작위로 "딱 1곳"의 결과만 돌아온다는 것을 실측으로 확인함. 해결:
 * dbnum 1개씩, 도서관 수만큼(7번) deploy를 "동시에" 호출(Promise.all)하고 결과를
 * 모아서 합치는 방식으로 변경.
 *
 * [2026-06-19 v7~v8 변경, 이후 전부 되돌림] "저자 검색"을 지원하려고 여러 시도를
 * 했었음 — 모든 도서관에 "제목 OR 저자" 적용(부작용으로 3개 도서관 실패), 강남구만
 * 예외 처리(부분적으로만 작동, "구병모"처럼 제목에 안 걸리는 순수 저자명 검색은
 * 실패) 등. 결국 강남구 시스템 자체가 "제목 OR 저자" 같은 복합조건 자체를 지원하지
 * 않고(category2/text2를 통째로 무시), 제목 검색과 저자 검색이 완전히 분리된
 * 별개의 기능으로만 동작한다는 것을 실측으로 확인함.
 *
 * [2026-06-19 v9 변경 — 서비스 방향 재정의] 서비스 본질("지금 이 책을
 * 빌릴 수 있는지 확인하는 도구")에 맞춰, 저자 검색·통합검색 지원을 포기하고
 * 서명(제목) 검색 전용으로 고정함.
 *
 * [2026-06-20 v10 변경] 강남구 상세페이지 조회가 8초 제한 시간에 걸려 자주
 * 실패하는 문제를 로그로 확인함(TimeoutError 실측). 강남구 상세페이지 요청에만
 * 더 긴 제한 시간(15초)을 적용함.
 *
 * [2026-06-20 v11~v16 변경] 강남구 4중 원인 해결 — 타임아웃 연장, EUC-KR
 * 디코딩, 정확한 div 선택(.book_info > div.current), span 탐색 범위 확장
 * (직속 자식만 → 몇 단계든 전부).
 *
 * [2026-06-20 v17~v20 변경] 판본 묶기 1차 구현 — 제목+저자 완전일치(1차) +
 * 출판일 일치(2차 보조기준). 금천구는 Date 필드가 없어 빈 날짜는 보조기준
 * 비교에서 항상 제외하는 안전장치 적용.
 *
 * [2026-06-20 v21 변경 — 중요] N/M 대출가능 판정 공식이 거꾸로였음이 5개
 * 도서관(구로구·동대문구·마포구·금천구·서울시육아종합지원센터) 실측 대조로
 * 확인됨. "N/M"의 N은 "대출가능 권수"가 아니라 "현재 대출중인 권수"였음 —
 * 화면 표시와 실제 사이트가 정반대로 나오던 근본 원인. isRatioAvailable과
 * extractRatioNumerator(→calculateLoanableCount로 이름 변경) 두 함수의
 * 판정 기준을 반전시켜 수정함. 영향받는 dbnum: 44891, 45351, 45051, 45011,
 * 103301. 강남구·서초구·서울시 전자도서관은 이 함수를 쓰지 않아 영향 없음.
 *
 * [2026-06-20 v22 변경] 서초구 loanable 필드 신뢰 철회. "달러구트 꿈 백화점 2"
 * 실측 결과 owned=3, loaned=1인데 loanable=1로 응답함(직접 계산하면 2여야
 * 함). 전자책은 전량 대출중일 때만 예약 가능한 구조라 "보유-대출" 직접
 * 계산이 더 안전하다고 판단, loanable 필드 사용을 중단하고 강남구와 동일한
 * 방식(owned - loaned)으로 변경.
 *
 * 흐름:
 *   1. default_search 페이지 방문 → ls_session 쿠키 확보
 *   2. EBOOK_DBNUMS 각각에 대해 deploy를 동시에 호출 (dbnum 파라미터에 1개씩만,
 *      검색조건은 항상 서명(제목, category1=1)으로 고정)
 *   3. 7개 응답을 모두 모아서 합친 뒤, 도서관별(dbnum) 해석 규칙 적용해 대출가능
 *      여부 판단
 *   4. 강남구는 상세페이지 추가조회 필요 (XML만으로 판단 불가)
 *   5. 제목+저자 완전일치 기준으로 같은 책 묶기 (+ 출판일 보조기준)
 */

import * as cheerio from "cheerio";
import { EbookBook, EbookLibraryEntry } from "@/types";

const BASE_URL = "https://meta.seoul.go.kr/libseoul";

// [2026-06-20 v10] 대부분의 도서관 요청에 쓰는 기본 제한 시간(밀리초).
// 강남구는 따로 더 긴 값을 쓰므로 이 상수와는 별개로 관리함 (아래
// GANGNAM_TIMEOUT_MS 참조).
const DEFAULT_TIMEOUT_MS = 8000;

// [2026-06-20 v10 추가] 강남구 상세페이지 전용 제한 시간. 다른 도서관(보통 1초
// 안팎 응답)과 달리 강남구는 반복적으로 느려서(실측 TimeoutError 확인,
// 2026-06-20) 8초보다 넉넉하게 잡음. 이 값으로도 실패가 잦으면 더 늘리거나
// 재시도 로직을 추가하는 다음 단계로 넘어갈 것 — handoff 문서 참조.
const GANGNAM_TIMEOUT_MS = 15000;

// handoff 3-1장: 전자책도서관 8곳
const EBOOK_LIBRARIES: Record<string, string> = {
  "44911": "강남구립전자도서관",
  "44891": "구로구립전자도서관",
  "45011": "금천구립전자도서관",
  "45351": "동대문구립전자도서관",
  "45051": "마포구립전자도서관",
  "45111": "서초구립전자도서관",
  "103301": "서울시육아종합지원센터",
  "103291": "서울시 전자도서관",
};
const EBOOK_DBNUMS = Object.keys(EBOOK_LIBRARIES);

/**
 * id 생성 — handoff v4 실측 확정: 13자리 밀리초 타임스탬프 + 5자리 임의숫자
 *
 * [주의] 도서관별로 deploy를 따로 호출하지만, 같은 검색 1건으로 취급되어야 하므로
 * 7개 요청 모두 "같은 id"를 사용함.
 */
function generateRequestId(): string {
  const millis = Date.now().toString(); // 13자리
  const rand = Math.floor(10000 + Math.random() * 90000).toString(); // 5자리
  return millis + rand;
}

/**
 * fetch 응답의 Set-Cookie 헤더들을 모아서 "Cookie: a=1; b=2" 형식 문자열로 변환.
 */
function extractCookies(res: Response): string {
  const headersAny = res.headers as Headers & { getSetCookie?: () => string[] };
  let rawCookies: string[] = [];

  if (typeof headersAny.getSetCookie === "function") {
    rawCookies = headersAny.getSetCookie();
  } else {
    const single = res.headers.get("set-cookie");
    if (single) rawCookies = [single];
  }

  if (rawCookies.length === 0) return "";

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
  state?: string;
  loan?: string;
  loanKorean?: string;
  reserveKorean?: string;
};

/**
 * 전자책 검색 메인 함수 (v9 — 서명(제목) 검색 전용)
 */
export async function searchEbooks(query: string): Promise<EbookBook[]> {
  console.log("[seoulLibrary] CODE VERSION MARKER: v22-seocho-direct-calc-20260620");

  const id = generateRequestId();
  console.log("[seoulLibrary] generated id (shared across all dbnum calls):", id);

  // 1단계: default_search 방문 — ls_session 쿠키 확보 (도서관별 호출 전 1회만)
  const defaultSearchUrl = `${BASE_URL}/index.php/default_search`;

  let cookie = "";
  try {
    const res = await fetch(defaultSearchUrl, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] stage1 (default_search) status:", res.status);
    cookie = extractCookies(res);
    console.log("[seoulLibrary] stage1 cookie value:", cookie || "(empty)");
  } catch (e) {
    console.log("[seoulLibrary] stage1 fetch failed:", e);
  }

  // 2단계: 도서관별로 deploy를 동시에 호출 (dbnum 1개씩만 넣어서)
  const buildDeployUrl = (dbnum: string) => {
    const encodedQuery = encodeURIComponent(query);

    const searchQueryParams =
      `category1=1` +
      `&category2=0&category3=0` +
      `&text1=${encodedQuery}&text2=&text3=` +
      `&op=0&op2=0&year1=&year2=` +
      `&dbnum=${dbnum}` +
      `&display=30&recstart=1&sort=rel`;

    return `${BASE_URL}/index.php/ajax/engine/deploy?id=${id}&${searchQueryParams}&_=${Date.now()}`;
  };

  const fetchOneLibrary = async (dbnum: string): Promise<RawRecord[]> => {
    const url = buildDeployUrl(dbnum);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...(cookie ? { Cookie: cookie } : {}),
          "X-Requested-With": "XMLHttpRequest",
          Referer: defaultSearchUrl,
          Accept: "text/xml, application/xml, */*",
        },
      });
      console.log(`[seoulLibrary] deploy(${dbnum}) status:`, res.status);
      if (!res.ok) return [];

      const xml = await res.text();
      console.log(`[seoulLibrary] deploy(${dbnum}) xml length:`, xml.length);

      const isEmptyResult = /count="0"/.test(xml);
      if (!xml.includes("Success") && !isEmptyResult) {
        console.log(`[seoulLibrary] deploy(${dbnum}) resultinfo did not report Success`);
        console.log(`[seoulLibrary] deploy(${dbnum}) FULL RESPONSE (no Success):`, xml);
      }

      return parseXml(xml, dbnum);
    } catch (e) {
      console.log(`[seoulLibrary] deploy(${dbnum}) fetch failed:`, e);
      return [];
    }
  };

  // 7개 도서관에 동시에 요청 — 가장 느린 응답 시간만큼만 기다리면 됨
  const resultsByLibrary = await Promise.all(EBOOK_DBNUMS.map(fetchOneLibrary));
  const rawRecords = resultsByLibrary.flat();

  console.log("[seoulLibrary] total parsed records across all libraries:", rawRecords.length);
  console.log(
    "[seoulLibrary] dbnums that returned results:",
    Array.from(new Set(rawRecords.map((r) => r.dbnum)))
  );
  if (rawRecords.length === 0) return [];

  const entries = await Promise.all(
    rawRecords.map((r) => resolveAvailability(r))
  );

  return groupBooks(
    rawRecords.map((r, i) => ({ raw: r, entry: entries[i] })).filter((x) => x.entry !== null) as {
      raw: RawRecord;
      entry: EbookLibraryEntry;
    }[]
  );
}

/**
 * XML 파싱 — deploy 응답 구조 기준 (cheerio 복원)
 */
function parseXml(xml: string, expectedDbnum: string): RawRecord[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const records: RawRecord[] = [];

  $("record").each((_: number, el: any) => {
    const dbnum = $(el).attr("dbnum") ?? "";
    const dbname = $(el).attr("dbname") ?? "";

    // 우리가 요청한 도서관과 다른 dbnum이 섞여 들어오면 무시 (안전장치)
    if (dbnum !== expectedDbnum) {
      console.log(
        `[seoulLibrary] unexpected dbnum in response: expected ${expectedDbnum}, got ${dbnum} - skipping`
      );
      return;
    }

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
 * 도서관별 대출가능 해석 — handoff 6장 표 기준 (v21에서 N/M 판정 반전 수정됨)
 */
async function resolveAvailability(r: RawRecord): Promise<EbookLibraryEntry | null> {
  const libraryName = EBOOK_LIBRARIES[r.dbnum] ?? r.dbname;

  switch (r.dbnum) {
    case "45011": {
      // 금천구 — 103301(서울시육아종합지원센터)과 동일한 FxLibrary 시스템.
      return resolveChildrenLibraryAvailability(r, libraryName);
    }

    case "45111": {
      // 서초구 — JSON API 직접 호출 (v22: loanable 필드 대신 직접 계산)
      return resolveSeochoAvailability(r, libraryName);
    }

    case "45351":
    case "44891": {
      const available = isRatioAvailable(r.loan);
      const loanableCount = calculateLoanableCount(r.loan);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan, loanableCount };
    }

    case "45051": {
      const available = isRatioAvailable(r.loanKorean);
      const loanableCount = calculateLoanableCount(r.loanKorean);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loanKorean, loanableCount };
    }

    case "44911": {
      return resolveGangnamAvailability(r, libraryName);
    }

    case "103301": {
      return resolveChildrenLibraryAvailability(r, libraryName);
    }

    case "103291": {
      // 서울시 전자도서관 — 로그인해야만 값을 채워주는 구조라 항상 "직접 확인" 안내로 고정
      return {
        dbnum: r.dbnum,
        libraryName,
        available: false,
        url: r.url,
        loanInfo: "대출가능여부 사이트 확인",
      };
    }

    default:
      return null;
  }
}

/**
 * [2026-06-20 v21 변경 — 실측으로 확인된 의미 정정] "N/M" 형식에서 N은
 * "대출가능 권수"가 아니라 "현재 대출중인 권수"였음이 5개 도서관(구로구,
 * 동대문구, 마포구, 금천구, 서울시육아종합지원센터) 실측 대조로 확인됨.
 * 화면 표시와 실제 사이트가 정반대로 나오는 문제의 원인이었음 — 화면 vs
 * 실제 사이트의 숫자 자체는 정확히 일치했고(파싱은 맞았음), 그 숫자의
 * 의미("가능 권수"로 해석)만 틀렸던 것.
 *
 * "0/2" 같은 분자/분모 텍스트 — 분자(대출중)가 분모(전체)보다 적으면
 * 대출가능(true), 같으면(전부 대출중) 대출불가(false).
 */
function isRatioAvailable(text?: string): boolean {
  if (!text) return false;
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return false;
  const loaned = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  return loaned < total;
}

/**
 * [2026-06-20 v21 변경 — 실측으로 확인된 의미 정정] 함수 이름과 반환값을
 * 모두 정정함. "N/M"의 N은 대출중 권수이므로, 실제 빌릴 수 있는 권수는
 * "M(전체) - N(대출중)"으로 계산해야 함(isRatioAvailable과 같은 근거,
 * 위 주석 참조). 기존 함수명(extractRatioNumerator)은 "분자를 그대로
 * 꺼내온다"는 잘못된 전제를 담고 있어, 계산까지 포함하는 새 이름으로
 * 변경함. 형식이 안 맞으면 undefined.
 */
function calculateLoanableCount(text?: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return undefined;
  const loaned = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  const loanable = total - loaned;
  return loanable > 0 ? loanable : 0;
}

/**
 * 강남구 상세페이지 추가조회 — handoff 6-1장
 * 보유 - 대출 = 빌릴 수 있는 권수 (0보다 크면 대출가능)
 */
async function resolveGangnamAvailability(
  r: RawRecord,
  libraryName: string
): Promise<EbookLibraryEntry | null> {
  if (!r.url) {
    console.log("[seoulLibrary] gangnam: record has no detail url, title:", r.title);
    return null;
  }

  try {
    const res = await fetch(r.url, {
      signal: AbortSignal.timeout(GANGNAM_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] gangnam detail page status:", res.status, "url:", r.url);
    if (!res.ok) {
      console.log("[seoulLibrary] gangnam: detail page fetch not ok, title:", r.title);
      return null;
    }

    // 강남구 페이지가 EUC-KR로 인코딩되어 있어, res.text()(항상 UTF-8로 해석)
    // 대신 원본 바이트를 받아서 직접 EUC-KR로 디코딩함.
    const rawBuffer = await res.arrayBuffer();
    const decoder = new TextDecoder("euc-kr");
    const html = decoder.decode(rawBuffer);
    console.log("[seoulLibrary] gangnam detail html length (EUC-KR decoded):", html.length);

    const $ = cheerio.load(html);

    // "이 책"의 current는 book_info 안에 있음 (추천 목록 쪽 current와 구분)
    const currentDiv = $(".book_info > div.current").first();

    // "> span"(바로 아래 자식만)이 아닌 "span"(몇 단계 안에 있든 전부)으로 찾음
    // — 강남구 HTML이 책마다 태그가 제대로 안 닫히는 경우가 있어서, 태그가 안
    // 닫힌 경우와 정상적으로 닫힌 경우 둘 다 대응되도록 함.
    const findStrongByLabel = (label: string): string | undefined => {
      const span = currentDiv
        .find("span")
        .filter((_: number, el: any) => {
          const ownText = $(el).clone().children().remove().end().text().trim();
          if (!ownText.startsWith(label)) return false;
          if (ownText.startsWith("대출예정일")) return false; // "대출"과 구분
          return true;
        })
        .first();
      return span.find("strong").first().text().trim();
    };

    const ownedText = findStrongByLabel("보유");
    const loanedText = findStrongByLabel("대출");

    console.log(
      "[seoulLibrary] gangnam label-based values - 보유:",
      ownedText,
      "대출:",
      loanedText
    );

    const owned = ownedText !== undefined ? parseInt(ownedText, 10) : NaN;
    const loaned = loanedText !== undefined ? parseInt(loanedText, 10) : NaN;

    if (Number.isNaN(owned) || Number.isNaN(loaned)) {
      console.log(
        "[seoulLibrary] gangnam: could not parse owned/loaned numbers, title:",
        r.title,
        "- ownedText:",
        ownedText,
        "loanedText:",
        loanedText
      );
      return null;
    }

    const remaining = owned - loaned;
    return {
      dbnum: r.dbnum,
      libraryName,
      available: remaining > 0,
      url: r.url,
      loanInfo: `보유 ${owned} / 대출 ${loaned}`,
      loanableCount: remaining > 0 ? remaining : 0,
    };
  } catch (e) {
    console.log("[seoulLibrary] gangnam detail fetch threw error, title:", r.title, "error:", e);
    return null;
  }
}

/**
 * FxLibrary 계열 도서관 상세페이지 추가조회 (서울시육아종합지원센터·금천구 공용)
 *
 * deploy 응답 XML에는 대출가능 관련 필드가 없어, 강남구처럼 상세페이지 추가조회가
 * 필요함. 페이지에 이렇게 표시됨:
 *   <ul class="state">
 *     <li><p>대출</p>0/1</li>
 *     <li><p>예약</p>0</li>
 *     ...
 *   </ul>
 * "대출" 글자가 있는 <li>의 전체 텍스트에서 "분자/분모" 형식을 그대로 추출.
 */
async function resolveChildrenLibraryAvailability(
  r: RawRecord,
  libraryName: string
): Promise<EbookLibraryEntry | null> {
  if (!r.url) {
    console.log("[seoulLibrary] childrenLibrary: record has no detail url, title:", r.title);
    return null;
  }

  try {
    const res = await fetch(r.url, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] childrenLibrary detail page status:", res.status, "url:", r.url);
    if (!res.ok) {
      console.log("[seoulLibrary] childrenLibrary: detail page fetch not ok, title:", r.title);
      return null;
    }
    const html = await res.text();
    console.log("[seoulLibrary] childrenLibrary detail html length:", html.length);

    const $ = cheerio.load(html);

    // "대출"이라는 글자를 담은 <p> 태그의 부모 <li> 전체 텍스트를 가져옴
    const loanLiText = $("ul.state li")
      .filter((_: number, el: any) => $(el).find("p").text().trim() === "대출")
      .first()
      .text()
      .trim();

    console.log("[seoulLibrary] childrenLibrary loan li text:", JSON.stringify(loanLiText));

    // "대출" 글자를 떼어내고 남은 "0/1" 부분만 추출
    const loanText = loanLiText.replace("대출", "").trim();
    const available = isRatioAvailable(loanText);

    if (!loanText) {
      console.log(
        "[seoulLibrary] childrenLibrary: could not find loan text, title:",
        r.title
      );
      return {
        dbnum: r.dbnum,
        libraryName,
        available: false,
        url: r.url,
        loanInfo: "대출가능여부 사이트 확인",
      };
    }

    return {
      dbnum: r.dbnum,
      libraryName,
      available,
      url: r.url,
      loanInfo: loanText,
      loanableCount: calculateLoanableCount(loanText),
    };
  } catch (e) {
    console.log(
      "[seoulLibrary] childrenLibrary detail fetch threw error, title:",
      r.title,
      "error:",
      e
    );
    return null;
  }
}

/**
 * 서초구 대출가능 조회 — 2026-06-19 실측으로 발견한 JSON API 사용
 *
 * 서초구 상세페이지(e-book.seocholib.or.kr/content/detail?...)의 정적 HTML에는
 * 권수 정보가 없음 — 페이지가 로드된 뒤 자바스크립트가 아래 API를 추가로 호출해서
 * 화면에 숫자를 채워 넣는 구조였음:
 *   https://e-book.seocholib.or.kr/api/service/content/detail
 *     ?contentType=EB&id={contentId}&libCode=MA
 * 응답은 JSON이라 HTML 파싱(cheerio)이 필요 없음. 핵심 필드:
 *   - copys: 보유 권수, loanCnt: 현재 대출중인 권수
 *
 * [2026-06-20 v22 변경 — loanable 필드 신뢰 철회] "달러구트 꿈 백화점 2"
 * 실측 결과 owned=3, loaned=1(실제 사이트 "대출 1/3"과 일치)인데도
 * loanable=1로 응답함(직접 계산하면 3-1=2여야 함). 처음 실측한 책 2건에서는
 * 우연히 owned-loaned와 일치했을 뿐, 서초구의 loanable이 우리가 모르는
 * 다른 기준(예약 우선순위 등)으로 계산되고 있을 가능성이 있어 더 이상
 * 신뢰하지 않음. 전자책은 보유 권수가 전부 대출중일 때만 예약이 가능한
 * 구조라(2026-06-20 확인), "예약자에게 우선권이 있어 실제로는 못 받는"
 * 케이스 자체가 존재하지 않음 — 따라서 강남구와 동일하게 "보유-대출"을
 * 직접 계산하는 방식이 더 안전함. loanable 필드는 더 이상 사용하지 않음.
 * libCode=MA는 책 2건(실측)에서 동일했음 — 서초구 전체 대표 코드로 추정,
 * 고정값 사용. (만약 분관마다 다른 libCode가 있다면 추후 재검토 필요)
 */
async function resolveSeochoAvailability(
  r: RawRecord,
  libraryName: string
): Promise<EbookLibraryEntry | null> {
  if (!r.url) {
    console.log("[seoulLibrary] seocho: record has no detail url, title:", r.title);
    return null;
  }

  // r.url 예시: https://e-book.seocholib.or.kr/content/detail?contentType=EB&id=4801191998376
  // 위 URL에서 id 값만 뽑아서 API 주소를 직접 만듦
  const idMatch = r.url.match(/[?&]id=([^&]+)/);
  const contentId = idMatch?.[1];

  if (!contentId) {
    console.log("[seoulLibrary] seocho: could not extract id from url:", r.url);
    return null;
  }

  const apiUrl = `https://e-book.seocholib.or.kr/api/service/content/detail?contentType=EB&id=${contentId}&libCode=MA`;

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    console.log("[seoulLibrary] seocho api status:", res.status, "url:", apiUrl);
    if (!res.ok) {
      console.log("[seoulLibrary] seocho: api fetch not ok, title:", r.title);
      return null;
    }

    const json = await res.json();
    const data = json?.data;

    if (!data || typeof data.copys !== "number" || typeof data.loanCnt !== "number") {
      console.log("[seoulLibrary] seocho: unexpected json shape, title:", r.title, "json:", json);
      return null;
    }

    const owned = data.copys;
    const loaned = data.loanCnt;
    const loanable = owned - loaned;

    console.log(
      "[seoulLibrary] seocho parsed - owned:",
      owned,
      "loaned:",
      loaned,
      "loanable (직접계산):",
      loanable
    );

    return {
      dbnum: r.dbnum,
      libraryName,
      available: loanable > 0,
      url: r.url,
      loanInfo: `보유 ${owned} / 대출 ${loaned}`,
      loanableCount: loanable > 0 ? loanable : 0,
    };
  } catch (e) {
    console.log("[seoulLibrary] seocho api fetch threw error, title:", r.title, "error:", e);
    return null;
  }
}

/**
 * 판본 묶기 — handoff 7장 1차 기준(제목+저자 완전일치) + 2026-06-20 추가된
 * 2차 보조기준(출판일 일치)
 */
function groupBooks(items: { raw: RawRecord; entry: EbookLibraryEntry }[]): EbookBook[] {
  const normalize = (s: string) => s.replace(/\s+/g, "");

  console.log(
    "[seoulLibrary] groupBooks DEBUG - raw items (dbnum, title, author, date, isbn):",
    JSON.stringify(
      items.map(({ raw }) => ({
        dbnum: raw.dbnum,
        title: raw.title,
        author: raw.author,
        date: raw.date,
        isbn: raw.isbn,
      }))
    )
  );

  // 1차 기준: 제목+저자 완전일치로 먼저 묶음
  const groups = new Map<string, EbookBook & { rawDate: string; rawDbnums: string[] }>();

  for (const { raw, entry } of items) {
    const key = `${normalize(raw.title)}__${normalize(raw.author)}`;
    const existing = groups.get(key);

    if (existing) {
      if (!existing.libraries.some((l: EbookLibraryEntry) => l.dbnum === entry.dbnum)) {
        existing.libraries.push(entry);
      }
      if (!existing.coverImage && raw.image) existing.coverImage = raw.image;
      if (!existing.rawDbnums.includes(raw.dbnum)) existing.rawDbnums.push(raw.dbnum);
    } else {
      groups.set(key, {
        title: raw.title,
        author: raw.author,
        publisher: raw.publisher || undefined,
        publishDate: raw.date || undefined,
        coverImage: raw.image,
        libraries: [entry],
        rawDate: raw.date || "",
        rawDbnums: [raw.dbnum],
      });
    }
  }

  // 2차 보조기준: 출판일(Date)이 같은 그룹들을 추가로 합침.
  // "비교할 날짜 값 자체가 비어있으면" 항상 보조기준 비교에서 제외함(금천구 등
  // 날짜를 못 주는 도서관이 잘못 합쳐지는 것을 방지).
  const mergedByDate = new Map<string, EbookBook & { rawDate: string; rawDbnums: string[] }>();

  for (const group of Array.from(groups.values())) {
    const dateKey = group.rawDate.trim();

    if (!dateKey) {
      mergedByDate.set(`__nodate__${group.title}__${group.author}__${group.rawDbnums.join(",")}`, group);
      continue;
    }

    const existing = mergedByDate.get(dateKey);
    if (existing) {
      console.log(
        "[seoulLibrary] groupBooks: merging by publishDate -",
        `"${existing.title}"(${existing.author}) + "${group.title}"(${group.author})`,
        `date=${dateKey}`
      );
      for (const entry of group.libraries) {
        if (!existing.libraries.some((l: EbookLibraryEntry) => l.dbnum === entry.dbnum)) {
          existing.libraries.push(entry);
        }
      }
      if (!existing.coverImage && group.coverImage) existing.coverImage = group.coverImage;
    } else {
      mergedByDate.set(dateKey, group);
    }
  }

  return Array.from(mergedByDate.values()).map(({ rawDate, rawDbnums, ...book }) => book);
}