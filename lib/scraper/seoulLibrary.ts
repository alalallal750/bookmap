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
 * [2026-06-19 v9 변경 — 서비스 방향 재정의] 저자 검색·통합검색 지원을 포기하고
 * 서명(제목) 검색 전용으로 고정함.
 *
 * [2026-06-20 v10 변경] 강남구 상세페이지 전용 제한 시간(15초) 적용.
 *
 * [2026-06-20 v11~v16 변경] 강남구 4중 원인 해결 — 타임아웃 연장, EUC-KR
 * 디코딩, 정확한 div 선택(.book_info > div.current), span 탐색 범위 확장.
 *
 * [2026-06-20 v21 변경] N/M 대출가능 판정 공식이 거꾸로였음이 5개 도서관
 * (구로구·동대문구·마포구·금천구·서울시육아종합지원센터) 실측 대조로 확인됨.
 * "N/M"의 N은 "대출가능 권수"가 아니라 "현재 대출중인 권수"였음. 영향받는
 * dbnum: 44891, 45351, 45051, 45011, 103301.
 *
 * [2026-06-20 v22 변경] 서초구 loanable 필드 신뢰 철회, 보유-대출 직접 계산으로 변경.
 *
 * [2026-06-20 v23 변경] 동대문구(45351) 벤더(교보/yes24 등) 권수 합산 로직 추가.
 * groupBooks(도서관 간 묶기)와 책임 분리를 위해 별도 함수(mergeDongdaemoonVendors)로
 * 구현, groupBooks 호출 전 단계에서 처리.
 *
 * [2026-06-20 v24 변경 — groupBooks 정리] 아래 3가지를 반영, 구두점/권수 정규화
 * 규칙은 보류(추후 결정):
 *   1. 출판일(Date) 보조기준 완전 폐기 — "출판일/ISBN 둘 다 신뢰 불가 데이터"로
 *      이미 확정된 상태에서, 보조수단으로라도 남기면 우연히 통과하다가 다른 책을
 *      잘못 합치는 사고 위험이 있다고 판단해 통째로 제거함. 못 묶이면 분리된
 *      채로 두는 게 더 안전(v3 문서 "정확도 우선" 원칙과 일치).
 *   2. 저자 표기 비교 시 "저, 지음, 글, 옮김, 엮음, 그림" 같은 1~2글자 공통
 *      문구는 비교에서 제외 — 모든 저자에게 공통으로 붙는 글자라 비교에 의미가
 *      없고, 오히려 표기 차이로 같은 책이 분리되는 원인이 됐었음(v6 문서 2-6장
 *      핵심 통찰).
 *   3. 강남구의 "광고 카피가 제목에 섞이는" 특수 사례는 이번 정리에서 보류.
 *      구두점 정규화로 풀리는 문제가 아니라 별도 패턴 감지가 필요한 다른 종류의
 *      문제라, 한 번에 묶어서 처리하면 또 여러 책임이 섞인 함수가 될 위험이 있음.
 *      발생 빈도가 낮아(1건) 우선순위 낮춤, 별도 기록만 해둠.
 *
 * 제목 자체의 구두점 정규화(. : | - 등 제거, 권수 숫자는 보존)는 아직 결정
 * 보류 상태 — 현재는 v20과 동일하게 "공백만 제거"하는 정규화를 그대로 사용함.
 * 결정되면 별도 함수(예: normalizeTitle)로 분리해 mergeDongdaemoonVendors와
 * 공통으로 쓸 수 있게 통합할 것(현재는 두 곳이 각자 다른 정규화를 씀).
 *
 * 흐름:
 *   1. default_search 페이지 방문 → ls_session 쿠키 확보
 *   2. EBOOK_DBNUMS 각각에 대해 deploy를 동시에 호출 (dbnum 파라미터에 1개씩만,
 *      검색조건은 항상 서명(제목, category1=1)으로 고정)
 *   3. 7개 응답을 모두 모아서 합친 뒤, 도서관별(dbnum) 해석 규칙 적용해 대출가능
 *      여부 판단
 *   4. 강남구는 상세페이지 추가조회 필요 (XML만으로 판단 불가)
 *   5. 동대문구 벤더 합산 (mergeDongdaemoonVendors)
 *   6. 제목+저자 일치 기준으로 같은 책 묶기 (저자 공통문구 제외 비교)
 */

import * as cheerio from "cheerio";
import * as iconv from "iconv-lite";
import { EbookBook, EbookLibraryEntry } from "@/types";

const BASE_URL = "https://meta.seoul.go.kr/libseoul";

const DEFAULT_TIMEOUT_MS = 8000;
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
 * [2026-06-20 v27 추가] 도서관별 검색창 URL 빌더 — 2026-06-20 실측으로
 * 확인한 8곳 패턴(논의 기록 참조).
 *
 * "지금빌려는 대출 가능 권수만 정확히 알려준다, 어느 벤더/페이지로 보낼지는
 * 도서관 검색결과 화면에서 사용자가 직접 본다"는 원칙에 따라, 상세페이지
 * 링크 대신 검색창 결과 화면으로 보냄. 이렇게 하면:
 *   - 동대문구처럼 벤더(교보/yes24)가 갈라진 경우도 사용자가 검색결과에서
 *     직접 선택 가능 (우리가 어느 벤더로 보낼지 고민할 필요 없음)
 *   - 서초구 구독자료/오디오처럼 통합검색이 놓치는 형태도 검색결과 화면에서
 *     자연스럽게 노출됨 (우리가 몰랐던 책도 사용자가 발견 가능)
 *   - 상세페이지 링크보다 검색창 URL이 더 단순하고 안 바뀔 가능성이 높음
 *
 * 강남구만 EUC-KR 인코딩 사용 — 나머지 7곳은 UTF-8. encodeURIComponent는
 * 항상 UTF-8 기준이라, 강남구는 별도로 EUC-KR 바이트로 변환 후 퍼센트
 * 인코딩해야 함(아래 encodeEucKr 함수 참조).
 */
function buildSearchPageUrl(dbnum: string, query: string): string | undefined {
  switch (dbnum) {
    case "44911": // 강남구 — EUC-KR
      return `https://ebook.gangnam.go.kr/elibbook/book_info.asp?strSearch=${encodeEucKr(query)}&search=title`;

    case "44891": // 구로구
      return `https://ebook.guro.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt=${encodeURIComponent(query)}`;

    case "45011": // 금천구
      return `https://elib.geumcheonlib.seoul.kr/FxLibrary/product/list/?page=1&keyoption2=0&category=&searchoption=1&searchType=search&keyword=${encodeURIComponent(query)}`;

    case "45351": // 동대문구
      return `https://e-book.l4d.or.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt=${encodeURIComponent(query)}`;

    case "45051": // 마포구
      return `https://ebook.mapo.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt=${encodeURIComponent(query)}`;

    case "45111": // 서초구
      return `https://e-book.seocholib.or.kr/search?keyword=${encodeURIComponent(query)}`;

    case "103301": // 서울시육아종합지원센터
      return `https://children.bookcube.biz/FxLibrary/product/list/?page=1&keyoption2=0&category=&searchoption=1&searchType=search&keyword=${encodeURIComponent(query)}`;

    case "103291": // 서울시 전자도서관
      return `https://elib.seoul.go.kr/contents/search/content?t=EB&k=${encodeURIComponent(query)}`;

    default:
      return undefined;
  }
}

/**
 * [2026-06-21 v28 변경] EUC-KR 퍼센트 인코딩 — 강남구 전용.
 * Node.js 내장 Buffer는 "ks_c_5601-1987"(EUC-KR) 인코딩을 지원하지 않음 —
 * 로컬 환경에서는 우연히 동작했을 수 있으나, Vercel 서버리스 실행 환경에서
 * "Unknown encoding" 에러를 던져 검색 기능 전체가 중단됨(v7 문서 0장 참조).
 * iconv-lite로 교체 — 이 패키지는 EUC-KR 변환을 정식으로 지원함.
 */
function encodeEucKr(text: string): string {
  const buffer = iconv.encode(text, "euc-kr");
  return Array.from(buffer)
    .map((byte) => "%" + byte.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

/**
 * id 생성 — handoff v4 실측 확정: 13자리 밀리초 타임스탬프 + 5자리 임의숫자
 */
function generateRequestId(): string {
  const millis = Date.now().toString();
  const rand = Math.floor(10000 + Math.random() * 90000).toString();
  return millis + rand;
}

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
  console.log("[seoulLibrary] CODE VERSION MARKER: v24-groupbooks-cleanup-20260620");

  const id = generateRequestId();
  console.log("[seoulLibrary] generated id (shared across all dbnum calls):", id);

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

  const resolvedItems = rawRecords
    .map((r, i) => ({ raw: r, entry: entries[i] }))
    .filter((x) => x.entry !== null) as { raw: RawRecord; entry: EbookLibraryEntry }[];

  const books = groupBooks(mergeDongdaemoonVendors(resolvedItems));

  // [2026-06-20 v27 추가] 상세페이지 링크 대신 도서관 검색창 결과 화면으로
  // 연결. 검색어는 우리 화면에 표시되는 책 제목(book.title)을 사용 — 1차
  // 시도가 안 맞으면 사용자가 검색창에서 직접 다른 검색어로 재시도 가능
  // (논의 기록 참조: "지금빌려에서 확인되는 도서명으로 넣어보고, 오류 생기면
  // 사용자가 원래 검색어로 재시도하는 흐름").
  // [2026-06-21 v28 변경] 도서관별 검색창 URL 생성 중 하나라도 에러가 나면
  // (예: 인코딩 문제, 예상 못 한 특수문자 등) 전체 검색 API가 죽는 사고가
  // 있었음(v7 문서 0장). try/catch로 감싸 "이 도서관 링크만 원래 링크로
  // 남겨두고 나머지는 정상 진행"하도록 안전장치 추가.
  for (const book of books) {
    for (const lib of book.libraries) {
      try {
        const searchPageUrl = buildSearchPageUrl(lib.dbnum, book.title);
        if (searchPageUrl) {
          lib.url = searchPageUrl;
        }
      } catch (e) {
        console.log(
          "[seoulLibrary] buildSearchPageUrl threw error, dbnum:",
          lib.dbnum,
          "title:",
          book.title,
          "error:",
          e
        );
      }
    }
  }

  return books;
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
      return resolveChildrenLibraryAvailability(r, libraryName);
    }

    case "45111": {
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
 * [2026-06-20 v21] "N/M"의 N은 대출중 권수. 분자(대출중)가 분모(전체)보다
 * 적으면 대출가능(true), 같으면(전부 대출중) 대출불가(false).
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
 * [2026-06-20 v21] 가능권수 = 전체(M) - 대출중(N).
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

    const rawBuffer = await res.arrayBuffer();
    const decoder = new TextDecoder("euc-kr");
    const html = decoder.decode(rawBuffer);
    console.log("[seoulLibrary] gangnam detail html length (EUC-KR decoded):", html.length);

    const $ = cheerio.load(html);
    const currentDiv = $(".book_info > div.current").first();

    const findStrongByLabel = (label: string): string | undefined => {
      const span = currentDiv
        .find("span")
        .filter((_: number, el: any) => {
          const ownText = $(el).clone().children().remove().end().text().trim();
          if (!ownText.startsWith(label)) return false;
          if (ownText.startsWith("대출예정일")) return false;
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

    const loanLiText = $("ul.state li")
      .filter((_: number, el: any) => $(el).find("p").text().trim() === "대출")
      .first()
      .text()
      .trim();

    console.log("[seoulLibrary] childrenLibrary loan li text:", JSON.stringify(loanLiText));

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
 * 서초구 대출가능 조회 — JSON API 사용
 *
 * [2026-06-20 v22] loanable 필드 신뢰 철회, 보유-대출 직접 계산으로 변경.
 */
async function resolveSeochoAvailability(
  r: RawRecord,
  libraryName: string
): Promise<EbookLibraryEntry | null> {
  if (!r.url) {
    console.log("[seoulLibrary] seocho: record has no detail url, title:", r.title);
    return null;
  }

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
 * [2026-06-20 v23] 동대문구(45351) 벤더 합산
 *
 * 동대문구는 같은 책을 교보문고/yes24 등 여러 벤더로 중복 보유하는 경우가
 * 실측으로 확인됨(예: "달러구트 꿈 백화점 2"(yes24) vs "달러구트 꿈 백화점. 2"
 * (교보) — 제목 표기가 구두점만 다름). "지금빌려는 대출 가능 권수만 정확히
 * 알려준다, 어느 벤더인지는 도서관 사이트에서 확인한다"는 원칙에 따라, 벤더
 * 구분 자체는 보여주지 않고 합산된 숫자만 보여줌.
 *
 * groupBooks(도서관 간 같은 책 묶기)와 책임을 분리하기 위해 별도 함수로 둠.
 *
 * [주의] 여기 쓰는 구두점 정규화(normalizeForVendorMerge)는 groupBooks의
 * 정규화 규칙과 별개로 관리되고 있음(2026-06-20 논의 기록 참조, groupBooks의
 * 제목 정규화 규칙은 아직 결정 보류 상태). 추후 groupBooks의 정규화 규칙이
 * 확정되면 공통 함수로 통합 검토할 것.
 */
function mergeDongdaemoonVendors(
  items: { raw: RawRecord; entry: EbookLibraryEntry }[]
): { raw: RawRecord; entry: EbookLibraryEntry }[] {
  const DONGDAEMOON_DBNUM = "45351";

  const normalizeForVendorMerge = (title: string) =>
    title.replace(/[.\s:|\-]/g, "");

  const dongdaemoonItems = items.filter((x) => x.raw.dbnum === DONGDAEMOON_DBNUM);
  const otherItems = items.filter((x) => x.raw.dbnum !== DONGDAEMOON_DBNUM);

  if (dongdaemoonItems.length <= 1) {
    return items;
  }

  const mergedMap = new Map<string, { raw: RawRecord; entry: EbookLibraryEntry }>();

  for (const item of dongdaemoonItems) {
    const key = normalizeForVendorMerge(item.raw.title);
    const existing = mergedMap.get(key);

    if (!existing) {
      mergedMap.set(key, item);
      continue;
    }

    const existingLoanable = existing.entry.loanableCount ?? 0;
    const addingLoanable = item.entry.loanableCount ?? 0;
    const mergedLoanable = existingLoanable + addingLoanable;

    console.log(
      "[seoulLibrary] mergeDongdaemoonVendors: merging -",
      `"${existing.raw.title}"(${existingLoanable}) + "${item.raw.title}"(${addingLoanable})`,
      `= ${mergedLoanable}`
    );

    mergedMap.set(key, {
      raw: existing.raw,
      entry: {
        ...existing.entry,
        available: mergedLoanable > 0,
        loanableCount: mergedLoanable,
        loanInfo: `대출가능 ${mergedLoanable}권 (여러 뷰어 합산)`,
      },
    });
  }

  return [...otherItems, ...Array.from(mergedMap.values())];
}

/**
 * [2026-06-20 v24] 저자 표기 비교 시 제외할 공통 문구.
 * "저", "지음" 등 모든 저자에게 공통으로 붙어 비교에 의미가 없는 글자들 —
 * 오히려 표기 차이로 같은 책이 잘못 분리되는 원인이었음(v6 문서 2-6장).
 */
const AUTHOR_COMMON_SUFFIXES = ["저", "지음", "글", "옮김", "엮음", "그림"];

/**
 * [2026-06-20 v24] 저자 비교용 정규화 — 공통 문구 제거 후 공백도 제거.
 * 예: "이미예 저" → "이미예", "이미예 지음" → "이미예"
 */
function normalizeAuthor(author: string): string {
  let result = author;
  for (const suffix of AUTHOR_COMMON_SUFFIXES) {
    result = result.replace(new RegExp(suffix, "g"), "");
  }
  return result.replace(/\s+/g, "");
}

/**
 * [2026-06-20 v24] 제목 비교용 정규화 — 현재는 공백만 제거(v20과 동일).
 * 구두점 제거/권수 보존 규칙은 결정 보류 상태(2026-06-20 논의 기록 참조).
 * 결정되면 이 함수만 수정하면 됨 — mergeDongdaemoonVendors와 통합도 이
 * 함수를 기준으로 검토할 것.
 */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "");
}

/**
 * 판본 묶기 — handoff 7장 1차 기준(제목+저자 일치)
 *
 * [2026-06-20 v24 변경] 출판일(Date) 2차 보조기준 완전 폐기. "출판일/ISBN
 * 둘 다 신뢰 불가 데이터"로 이미 확정된 상태에서, 보조수단으로라도 남기면
 * 우연히 통과하다가 다른 책을 잘못 합치는 사고 위험이 있다고 판단해 제거함.
 * 못 묶이면 분리된 채로 두는 게 더 안전(v3 문서 "정확도 우선" 원칙과 일치).
 * 저자 비교 시 공통 문구(저/지음 등) 제외 규칙 추가.
 *
 * 강남구 "광고 카피가 제목에 섞이는" 특수 사례는 이번 정리에서 보류 — 구두점
 * 정규화로 풀리는 문제가 아니라 별도 패턴 감지가 필요한 다른 종류의 문제,
 * 발생 빈도가 낮아(1건) 우선순위 낮춤.
 */
/**
 * [2026-06-20 v25 변경 — 출판일 보조기준 부분 복원] v24에서 "출판일/ISBN
 * 둘 다 신뢰 불가 데이터"라는 이유로 완전 폐기했으나, 그 결과 출판일
 * 보조기준이 가려주고 있던 "제목 구두점 표기 차이" 문제(예: "달러구트 꿈
 * 백화점. 2" vs "달러구트 꿈 백화점 2")가 그대로 드러나 카드가 늘어나는
 * 부작용이 실측으로 확인됨(2026-06-20). 제목/저자 정규화 규칙(구두점 목록,
 * 권수 보존)이 아직 결정 보류 상태인 동안의 임시 안전장치로, 출판일
 * 완전일치 시 합치는 규칙만 다시 추가함. 나머지 정규화 결정은 보류 유지.
 *
 * 금천구(45011)는 Date 필드 자체가 없는 것으로 확인되어(v3 문서 7-2장),
 * 빈 날짜는 항상 보조기준 비교에서 제외함 — 빈 값끼리 우연히 일치해
 * 다른 책이 잘못 합쳐지는 사고 방지.
 */
function groupBooks(items: { raw: RawRecord; entry: EbookLibraryEntry }[]): EbookBook[] {
  console.log(
    "[seoulLibrary] groupBooks DEBUG - raw items (dbnum, title, author, date, publisher):",
    JSON.stringify(
      items.map(({ raw }) => ({
        dbnum: raw.dbnum,
        title: raw.title,
        author: raw.author,
        date: raw.date,
        publisher: raw.publisher,
      }))
    )
  );

  // [2026-06-21 변경] 저자 필드가 공통문구(저/지음 등) 제거 후 빈 문자열이
  // 되는 항목 전용 처리. 실측 확인된 사례(동대문구+YES24 벤더, "난생처음
  // 킥복싱"·"달러구트" 등 3건 이상): 저자가 "저" 한 글자만 와서 정규화 후
  // 빈 문자열이 되고, 제목+저자 1차 기준으로 못 묶임. 출판일 보조기준도
  // 14일 차이가 나 신뢰 불가(도서관마다 등록일 기준이 다른 v6 문서의 알려진
  // 문제와 동일 패턴). 대신 "출판사(Publication)"는 3건 모두 정확히
  // 일치하는 것으로 확인되어, 저자 대신 출판사를 보조 신호로 사용.
  //
  // 규칙: 저자가 빈 문자열이 되는 항목은, 1차 기준(제목+저자)으로 그룹화할
  // 때 건너뛰고 별도로 모아둔 뒤, 이미 만들어진 그룹 중 "제목도 같고
  // 출판사도 같은" 그룹이 있으면 거기에 합류시킴. 합류 대상이 없으면
  // 독립된 새 카드로 둠(애매하면 분리해서 보여주는 기존 원칙과 동일 기조).
  //
  // 위험 범위: 이 처리는 "저자가 빈 문자열이 되는 항목"에만 적용되고,
  // 저자가 정상적으로 있는 모든 책은 기존처럼 제목+저자로 엄격하게 비교됨.
  // 동명이서(제목 같고 저자 다른 책)가 잘못 묶일 위험은, 출판사까지
  // 우연히 일치해야 하므로 매우 낮음(저자만으로 판단하는 것보다 안전).

  const itemsWithAuthor: typeof items = [];
  const itemsWithEmptyAuthor: typeof items = [];

  for (const item of items) {
    if (normalizeAuthor(item.raw.author)) {
      itemsWithAuthor.push(item);
    } else {
      itemsWithEmptyAuthor.push(item);
    }
  }

  // 1차 기준: 제목+저자 일치로 먼저 묶음 (저자가 정상적으로 있는 항목만)
  const groups = new Map<string, EbookBook & { rawDate: string }>();

  for (const { raw, entry } of itemsWithAuthor) {
    const key = `${normalizeTitle(raw.title)}__${normalizeAuthor(raw.author)}`;
    const existing = groups.get(key);

    if (existing) {
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
        rawDate: raw.date || "",
      });
    }
  }

  // 저자가 빈 문자열인 항목들 처리: 제목+출판사가 일치하는 기존 그룹을 찾아
  // 합류시키고, 없으면 독립된 새 그룹으로 추가
  for (const { raw, entry } of itemsWithEmptyAuthor) {
    const normalizedTitle = normalizeTitle(raw.title);
    const matchingGroup = Array.from(groups.values()).find(
      (g) =>
        normalizeTitle(g.title) === normalizedTitle &&
        raw.publisher &&
        g.publisher === raw.publisher
    );

    if (matchingGroup) {
      console.log(
        "[seoulLibrary] groupBooks: empty-author item merged by title+publisher -",
        `"${raw.title}"(${raw.dbnum}, publisher=${raw.publisher}) → joined "${matchingGroup.title}"(${matchingGroup.author})`
      );
      if (!matchingGroup.libraries.some((l: EbookLibraryEntry) => l.dbnum === entry.dbnum)) {
        matchingGroup.libraries.push(entry);
      }
      if (!matchingGroup.coverImage && raw.image) matchingGroup.coverImage = raw.image;
    } else {
      // 합류할 그룹이 없으면, 저자 빈 문자열 그대로 독립 키로 새 그룹 생성
      const fallbackKey = `${normalizedTitle}__${raw.dbnum}__${raw.date || ""}`;
      console.log(
        "[seoulLibrary] groupBooks: empty-author item has no matching group, kept separate -",
        `"${raw.title}"(${raw.dbnum}, publisher=${raw.publisher})`
      );
      groups.set(fallbackKey, {
        title: raw.title,
        author: raw.author,
        publisher: raw.publisher || undefined,
        publishDate: raw.date || undefined,
        coverImage: raw.image,
        libraries: [entry],
        rawDate: raw.date || "",
      });
    }
  }

  // 2차 보조기준: 출판일(Date)이 완전히 같은 그룹들을 추가로 합침.
  // 날짜 값이 비어있으면(금천구 등) 항상 비교 대상에서 제외.
  const mergedByDate = new Map<string, EbookBook & { rawDate: string }>();
  let noDateCounter = 0;

  for (const group of Array.from(groups.values())) {
    const dateKey = group.rawDate.trim();

    if (!dateKey) {
      mergedByDate.set(`__nodate__${noDateCounter++}`, group);
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

  const result = Array.from(mergedByDate.values()).map((g) => ({
    book: g,
    sortDate: g.rawDate.trim(),
  }));

  result.sort((a, b) => {
    if (!a.sortDate && !b.sortDate) return 0;
    if (!a.sortDate) return 1;
    if (!b.sortDate) return -1;
    return b.sortDate.localeCompare(a.sortDate);
  });

  return result.map(({ book }) => {
    const { rawDate, ...rest } = book;
    return rest;
  });
}