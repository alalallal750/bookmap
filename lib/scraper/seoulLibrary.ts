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
 * [2026-06-19 v9 변경 — 이번 버전, 서비스 방향 재정의] 서비스 본질("지금 이 책을
 * 빌릴 수 있는지 확인하는 도구")에 맞춰, 저자 검색·통합검색 지원을 포기하고
 * 서명(제목) 검색 전용으로 고정함. 이 결정으로:
 *   - 도서관마다 "저자검색"의 동작 방식이 달랐던 문제(동대문구는 사실상 전체검색처럼
 *     동작, 강남구는 전체검색 시 저자필드 무시)가 전부 해소됨 — 카테고리 선택지 자체가
 *     없어졌으므로 도서관별 불일치를 신경 쓸 필요가 없어짐
 *   - 강남구 예외처리 코드 전부 제거 가능 (제목 검색은 강남구에서도 실측으로 정상
 *     작동 확인됨)
 *   - SearchCategory 파라미터 자체를 함수에서 제거함 (호출하는 쪽 route.ts 등도
 *     함께 정리 필요)
 *
 * [2026-06-20 v10 변경] 강남구 상세페이지 조회가 8초 제한 시간에 걸려 자주
 * 실패하는 문제를 로그로 확인함(TimeoutError 실측). 다른 도서관들은 응답이
 * 1초 안팎인데 강남구만 반복적으로 느린 패턴이 v5 문서에도 이미 기록되어
 * 있었음. 1차 대응으로 강남구 상세페이지 요청에만 더 긴 제한 시간(15초)을
 * 적용함. 이 값으로도 자주 실패하면, 시간을 더 늘릴지 다른 방식(재시도 등)을
 * 검토할 다음 단계로 넘어갈 예정.
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
// [2026-06-19 추가] 서울시 전자도서관(103291) — 통합검색에 실제로는 포함되어 있었고
// (서울도서관 사이트 "지역별 > 중구" 폴더 안에 있었음), 제목 검색 응답도 정상적으로
// 옴. 다만 대출가능 여부(대출횟수/예약횟수)는 로그인해야만 서버가 값을 채워서
// 보내주는 구조로 확인됨(비로그인 상태 HTML에 숫자 자리가 비어있음, 강남구처럼
// "라벨만 깨진 것"과는 다른 경우 — 값 자체가 없음). 로그인 기능이 없는 우리
// 서비스로는 이 값을 알아낼 수 없으므로, 책 정보(제목·저자·표지 등)는 보여주되
// 대출가능 여부는 "사이트에서 직접 확인" 안내로 고정함(103301과 동일 패턴).
// 이 방식은 강남구 같은 상세페이지 추가조회가 필요 없어 오히려 가벼운 처리임.
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
 *
 * [2026-06-19] category 파라미터를 완전히 제거함. 서비스가 "책 탐색"이 아니라
 * "이 책을 지금 빌릴 수 있는지 확인"하는 목적 검색에 집중하기로 결정했기 때문에,
 * 검색 카테고리를 항상 서명(제목)으로 고정함.
 */
export async function searchEbooks(query: string): Promise<EbookBook[]> {
  console.log("[seoulLibrary] CODE VERSION MARKER: v10-gangnam-timeout-15s-20260620");

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
  //
  // [2026-06-19 v9] 검색조건을 서명(제목, category1=1) 단독으로 고정. 강남구
  // 포함 모든 도서관에서 제목 검색은 실측으로 정상 작동 확인됨 — 더 이상 도서관별
  // 예외처리가 필요 없음.
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

      // [2026-06-20 v20 수정] "Success"가 없으면 무조건 경고성 로그를 찍었으나,
      // 실측 확인 결과 도서관(예: 103301)이 검색 결과가 0건일 때 정상적으로
      // "Failed"를 응답하는 경우가 있었음(count="0"). 이건 에러가 아니라 "이
      // 책을 소장하지 않음"이라는 정상 응답이므로, count="0"인 경우는 로그를
      // 찍지 않음. count가 0이 아닌데도 Success가 없는 경우만 — 진짜로 이상한
      // 응답일 가능성이 있으므로 — 그대로 로그를 남김.
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
 *
 * [2026-06-19 v6 변경] 정규식 방식에서 cheerio로 되돌림 (기존 코드와의 일관성
 * 유지가 더 안전하다는 판단, 2026-06-19 논의 기록 참조). 이제 dbnum을 1개씩만
 * 보내므로 응답 안에 <record>가 항상 그 도서관 것만 들어있어, expectedDbnum과
 * 다른 record가 섞여 있으면 무시하는 안전장치를 추가함.
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
 * 도서관별 대출가능 해석 — handoff 6장 표 그대로 구현 (변경 없음)
 */
async function resolveAvailability(r: RawRecord): Promise<EbookLibraryEntry | null> {
  const libraryName = EBOOK_LIBRARIES[r.dbnum] ?? r.dbname;

  switch (r.dbnum) {
    case "45011": {
      // [2026-06-19 변경] 기존엔 r.state(텍스트, "대출가능"/"대출")만으로 판단했으나,
      // 상세페이지 실측 결과 금천구도 103301(서울시육아종합지원센터)과 똑같은
      // FxLibrary 시스템(<ul class="state"><li><p>대출</p>1/1</li>...)을 쓰고 있어
      // 정확한 권수(N/M)를 알 수 있음이 확인됨. 같은 함수 재사용.
      return resolveChildrenLibraryAvailability(r, libraryName);
    }

    case "45111": {
      // [2026-06-19 해결] 서초구 정적 HTML에는 권수가 없었지만, 페이지가 로드된 후
      // 자바스크립트가 추가로 호출하는 JSON API를 실측으로 찾아냄:
      //   https://e-book.seocholib.or.kr/api/service/content/detail
      //     ?contentType=EB&id={contentId}&libCode=MA
      // 응답 JSON의 loanable 필드가 "지금 빌릴 수 있는 권수"를 이미 계산해서
      // 줌(0이면 대출불가). 책 2건으로 실측 확인됨. libCode=MA는 두 건 모두
      // 동일해서 고정값으로 사용.
      return resolveSeochoAvailability(r, libraryName);
    }

    case "45351":
    case "44891": {
      const available = isRatioAvailable(r.loan);
      const loanableCount = extractRatioNumerator(r.loan);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan, loanableCount };
    }

    case "45051": {
      const available = isRatioAvailable(r.loanKorean);
      const loanableCount = extractRatioNumerator(r.loanKorean);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loanKorean, loanableCount };
    }

    case "44911": {
      return resolveGangnamAvailability(r, libraryName);
    }

    case "103301": {
      return resolveChildrenLibraryAvailability(r, libraryName);
    }

    case "103291": {
      // [2026-06-19] 서울시 전자도서관 — 대출가능 여부는 로그인해야만 서버가 값을
      // 채워 보내주는 구조로 확인됨(deploy 응답 XML에도 관련 필드 자체가 없음).
      // 로그인 기능이 없는 우리 서비스는 이 값을 알아낼 방법이 없으므로, 책이
      // 여기 있다는 사실만 알려주고 대출가능 여부는 항상 "직접 확인" 안내로 고정함.
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

/** "0/2" 같은 분자/분모 텍스트 — 분자가 0이면 대출중(false), 그 외 가능(true) */
function isRatioAvailable(text?: string): boolean {
  if (!text) return false;
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) > 0;
}

/**
 * [2026-06-19 추가] "0/2" 같은 분자/분모 텍스트에서 분자(대출가능 권수)만
 * 숫자로 추출. 형식이 안 맞으면 undefined.
 */
function extractRatioNumerator(text?: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!match) return undefined;
  return parseInt(match[1], 10);
}

/**
 * 강남구 상세페이지 추가조회 — handoff 6-1장
 * 보유 - 대출 = 빌릴 수 있는 권수 (0보다 크면 대출가능)
 *
 * [2026-06-20 v10 변경] 다른 도서관 상세조회보다 강남구가 반복적으로 느려
 * 8초 제한에 걸려 실패하는 경우가 로그로 확인됨(TimeoutError). 강남구 요청에만
 * GANGNAM_TIMEOUT_MS(15초)를 적용. 다른 동작은 변경 없음.
 *
 * [2026-06-20 v11 변경 — 중요] "한글이 깨져서 순서로만 찾을 수 있다"는 기존
 * 가정이 틀렸음이 실제 HTML 원본 확인으로 밝혀짐. "보유"/"대출"/"예약" 한글이
 * 전혀 깨지지 않고 정상적으로 들어있었음. 문제의 진짜 원인은 순서였음 — 일부
 * 책은 맨 앞에 "대출예정일"이라는 항목이 하나 더 붙어서(`대출예정일<strong>
 * 2026-07-06</strong>`), "1번째=보유, 2번째=대출"이라는 고정 순서 가정이
 * 깨지고 한 칸씩 밀려버림. 그 결과 날짜 문자열("2026-07-06")의 일부 숫자가
 * "보유 권수"로 잘못 읽혀 "2021권 대출가능" 같은 비정상 값이 표시됨(실측,
 * 2026-06-20).
 *
 * 해결: 순서 대신 "보유"/"대출" 글자 자체를 찾는 방식으로 변경. HTML 구조:
 *   <div class="current">
 *     <span>대출예정일<span><strong>2026-07-06</strong></span></span>  (있을 때도, 없을 때도 있음)
 *     <span>보유 <strong>5</strong></span>
 *     <span>대출 <strong>2</strong></span>
 *     <span>예약 <strong>10</strong></span>
 *   </div>
 * "보유"/"대출" 글자로 시작하는 <span>을 찾아 그 안의 <strong> 숫자를 가져오면,
 * "대출예정일" 항목이 있어도 없어도 항상 정확하게 찾을 수 있음(순서에 의존하지
 * 않으므로).
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

    // [2026-06-20 v14] 강남구 페이지가 EUC-KR로 인코딩되어 있어, res.text()
    // (항상 UTF-8로 해석) 대신 원본 바이트를 받아서 직접 EUC-KR로 디코딩함.
    const rawBuffer = await res.arrayBuffer();
    // [2026-06-20 v14 변경 — 진짜 원인 확인됨] DEBUG 로그로 두 가지 사실이
    // 동시에 확인됨:
    //   1) 강남구 페이지는 실제로 EUC-KR로 인코딩되어 있음(HTML <meta>에 명시된
    //      그대로). res.text()는 UTF-8로 가정하고 읽어버려서 한글이 깨짐(????).
    //      이전 세션엔 "한글이 안 깨진다"고 판단했었는데, 그건 다른 페이지였거나
    //      우연히 깨지지 않는 조합이었을 뿐 — 이 페이지(보유/대출/예약 부분)는
    //      명확히 깨짐이 실측으로 재확인됨.
    //   2) 페이지 안에 class="current"인 div가 2개 있음 — 하나는 "이 책"의 진짜
    //      정보, 다른 하나는 페이지 하단 "작가의 다른 책" 추천 목록 안에 있는
    //      것. .first()가 어느 쪽을 집을지는 보장되지 않아 잘못된 div를 읽을
    //      위험이 있었음. "book_info 클래스 안에 있는 current"로 좁혀서 정확히
    //      이 책의 정보만 가리키도록 수정함.
    const decoder = new TextDecoder("euc-kr");
    const html = decoder.decode(rawBuffer);
    console.log("[seoulLibrary] gangnam detail html length (EUC-KR decoded):", html.length);

    const $ = cheerio.load(html);

    // "이 책"의 current는 book_info 안에 있음 (추천 목록 쪽 current와 구분)
    const currentDiv = $(".book_info > div.current").first();

    // [2026-06-20 v16 변경 — 진짜 원인 확인됨] "혼모노" DEBUG2 로그로 확인된
    // 사실: 강남구 HTML이 책마다 태그가 제대로 안 닫히는 경우가 있음. 구체적으로
    // "대출예정일" span의 닫는 태그가 맨 끝에 한 번만 나와서, "보유"/"대출"/
    // "예약" span들이 "대출예정일" span의 자식(직속 자식이 아님)으로 끼어들어가
    // 버림:
    //   <span>대출예정일<span>...</span> <span>보유...</span> <span>대출...</span>
    //   <span>예약...</span></span>  ← 마지막에 한 번만 닫힘
    // "> span"(바로 아래 자식만)으로 찾으면 이 경우 못 찾음. "find("span")"
    // (몇 단계 안에 있든 전부 찾음)으로 넓혀서, 태그가 안 닫힌 경우와 정상적으로
    // 닫힌 경우(절창처럼 각자 따로 닫힌 경우) 둘 다 대응되도록 함.
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
 * — handoff 6장 "표시 형식 미확인" 항목 해결, 2026-06-19 실측으로 패턴 확인
 *
 * 함수명은 "ChildrenLibrary"이지만 실제로는 같은 FxLibrary 시스템을 쓰는 도서관
 * 전체(현재 103301, 45011)에 공용으로 사용됨. 이름은 처음 발견한 도서관(육아종합
 * 지원센터) 기준으로 남아있음 — 추후 정리 시 더 일반적인 이름으로 변경 고려.
 *
 * deploy 응답 XML에는 대출가능 관련 필드가 없어, 강남구처럼 상세페이지 추가조회가
 * 필요함. 다만 강남구와 달리 한글이 깨지지 않고(EUC-KR 인코딩 문제 없음), 페이지에
 * 이렇게 표시됨:
 *   <ul class="state">
 *     <li><p>대출</p>0/1</li>
 *     <li><p>예약</p>0</li>
 *     ...
 *   </ul>
 * "대출" 글자가 있는 <li>의 전체 텍스트에서 "분자/분모" 형식을 그대로 추출하면 됨
 * (다른 도서관(동대문구·구로구)에서 이미 쓰던 isRatioAvailable과 동일한 판단 방식
 * 재사용 가능).
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
    // (예: "대출0/1" — <p>대출</p> 다음에 바로 "0/1"이 붙어있는 구조)
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
      loanableCount: extractRatioNumerator(loanText),
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
 *   - loanable: "지금 빌릴 수 있는 권수"를 서초구 쪽에서 이미 계산해서 줌
 *     (0이면 대출불가, 그 외 가능 — 강남구처럼 우리가 직접 빼기 계산할 필요 없음)
 * libCode=MA는 책 2건(실측)에서 동일했음 — 서초구 전체 대표 코드로 추정, 고정값
 * 사용. (만약 분관마다 다른 libCode가 있다면 추후 재검토 필요)
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
    const loanable = typeof data.loanable === "number" ? data.loanable : owned - loaned;

    console.log(
      "[seoulLibrary] seocho parsed - owned:",
      owned,
      "loaned:",
      loaned,
      "loanable:",
      loanable
    );

    return {
      dbnum: r.dbnum,
      libraryName,
      available: loanable > 0,
      url: r.url,
      loanInfo: `보유 ${owned} / 대출 ${loaned}`,
      loanableCount: loanable,
    };
  } catch (e) {
    console.log("[seoulLibrary] seocho api fetch threw error, title:", r.title, "error:", e);
    return null;
  }
}

/**
 * 판본 묶기 — handoff 7장 1차 기준(제목+저자 완전일치) + 2026-06-20 추가된
 * 2차 보조기준(출판일 일치)
 *
 * [2026-06-20 v10 추가] 1차 기준(제목+저자 완전일치)만으로는 아래 두 케이스가
 * 묶이지 않는 문제가 실측으로 확인됨(v5 문서 5장 참조):
 *   - 저자 표기 차이: "이미예"(금천구) vs "저"(동대문구)
 *   - 제목 자체의 표기 오류: "달러구트 꿈 백화점 | 잠들어야만 입장 가능합니다"
 *     (강남구, 광고 카피가 제목에 잘못 합쳐짐) — 정상판과 분리되어 보임
 *
 * 해결: 1차 기준으로 먼저 묶은 뒤, 아직 분리되어 있는 그룹들 중 "출판일(Date)이
 * 서로 같은 그룹"이 있으면 합침. 단, 금천구(45011)는 통합검색 XML에 Date 필드
 * 자체가 없는 것으로 확인되어(v3 문서 7-2장) 이 보조기준 비교에서 제외함 —
 * 금천구 항목은 1차 기준(제목 완전일치)에서만 묶이고, 2차 기준으로는 다른
 * 그룹과 합쳐지지 않음.
 *
 * 위험성 평가(v3 문서 7-3장과 동일한 기조): 같은 저자가 같은 날 전혀 다른 책을
 * 내는 경우는 드물고, 그런 경우는 1차 기준(제목)에서 애초에 분리되어 있으므로
 * 2차 기준이 잘못 합칠 위험은 낮음으로 판단함.
 */
function groupBooks(items: { raw: RawRecord; entry: EbookLibraryEntry }[]): EbookBook[] {
  const normalize = (s: string) => s.replace(/\s+/g, "");

  // [2026-06-20 v17 — 진단] "달러구트 꿈 백화점"(금천구) 등 제목이 눈으로는
  // 완전히 같아 보이는데도 분리되는 사례, "데미안의 Wi-Fi ON"처럼 출판일까지
  // 같을 것으로 추정되는데도 안 합쳐지는 사례가 발견됨. 추측 대신, 각 record가
  // 실제로 어떤 title/author/date 값을 가지고 들어오는지 — 눈에 안 보이는
  // 공백·특수문자까지 — 그대로 확인하기 위한 진단 로그. JSON.stringify로
  // 찍어서 공백, 줄바꿈, 유사문자 등을 숨김 없이 드러냄.
  //
  // [2026-06-20 v18 추가] ISBN을 1차 묶기 기준으로 쓸 수 있는지 재검토하기 위해
  // isbn 필드도 같이 확인. v3 문서 1-2장에 "전자책 ISBN은 종종 빈값(-)"이라고
  // 기록되어 있었으나, 실제로 지금 도서관 8곳 전부에서 그런지 다시 실측 확인.
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

  // 1차 기준: 제목+저자 완전일치로 먼저 묶음 (기존 로직, 변경 없음)
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
  //
  // [2026-06-20 v19 변경 — 안전장치 수정] 기존엔 "그룹에 들어있는 도서관이
  // 전부 금천구(45011)뿐인지"를 봐서 금천구를 비교 대상에서 뺐음. 그런데 금천구
  // 항목이 1차 기준(제목+저자 완전일치)으로 이미 다른 도서관과 합쳐진 경우엔
  // 이 조건이 작동하지 않아, 금천구의 빈 날짜("")가 그룹의 대표 출판일로 그대로
  // 쓰이는 문제가 있었음. 빈 값끼리 우연히 일치해 버리면(예: 다른 도서관도
  // 어쩌다 날짜를 못 줘서 둘 다 ""인 경우), 서로 다른 책이 잘못 합쳐질 위험이
  // 있었음.
  //
  // 수정: 도서관이 누구인지와 상관없이, "비교할 날짜 값 자체가 비어있으면" 항상
  // 보조기준 비교에서 제외함. 이렇게 하면 금천구뿐 아니라 어떤 도서관이든 날짜를
  // 못 준 경우 안전하게 처리됨.
  //
  // [트레이드오프] 이 수정 때문에, 금천구 항목이 1차 기준(제목+저자 완전일치)
  // 만으로 다른 도서관과 못 묶이는 경우엔 — 날짜가 없으니 2차 기준의 도움도
  // 받을 수 없어 — 영구히 분리된 카드로 남게 됨. 이는 "위험한 추측으로 합치는
  // 것"보다 "안전하게 분리해서 보여주는 것"을 우선한 의도적 선택. 만약 금천구가
  // 실제로 1차 기준만으론 자주 분리되는 사례가 발견되면, 금천구 전용의 별도
  // 보조기준(예: 제목 일부만 비교)을 추가하는 걸 별도로 검토할 것.
  const mergedByDate = new Map<string, EbookBook & { rawDate: string; rawDbnums: string[] }>();

  for (const group of Array.from(groups.values())) {
    const dateKey = group.rawDate.trim();

    // 출판일 정보가 없으면(빈 값) 보조기준 비교 자체를 스킵
    // (자기 자신 그대로 결과에 포함됨, 다른 그룹과 합쳐지지 않음)
    if (!dateKey) {
      mergedByDate.set(`__nodate__${group.title}__${group.author}__${group.rawDbnums.join(",")}`, group);
      continue;
    }

    const existing = mergedByDate.get(dateKey);
    if (existing) {
      // 같은 출판일을 가진 다른 제목/저자 표기의 그룹을 발견 — 합침
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