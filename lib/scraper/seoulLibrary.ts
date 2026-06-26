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
import { EbookBook, EbookLibraryEntry, PhysicalBook, PhysicalLibrary, LibraryType } from "@/types";
import { DEFAULT_LOCATION, getNearbyDbnums, getAllDbnums, getDistrictName } from "@/lib/data/districtCoords";
import { findBranchCoord } from "@/lib/data/branchCoords";
import { findBranchHours } from "@/lib/data/branchHours";

const BASE_URL = "https://meta.seoul.go.kr/libseoul";

const DEFAULT_TIMEOUT_MS = 15000;
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
    // [2026-06-21 추가] "예약" 값도 함께 추출 — 예약 건수가 보유-대출
    // 가능권수를 넘어서면 실제로는 대출 불가능한 문제 발견(절창 사례:
    // 보유5/대출3이라 겉보기엔 2권 가능해 보이나, 실제 사이트 확인 결과
    // 예약 10건이 밀려있어 대출 불가능했음). 강남구는 "보유-대출" 계산값을
    // 예약자가 먼저 가져가는 구조로 추정 — 검증 전까지는 "예약이 1건이라도
    // 있으면 그 즉시 모두 예약자에게 우선권이 있다"고 보수적으로 가정하지
    // 않고, 우선 "보유-대출-예약" 합산식을 적용함(아래 주석 참조).
    const reservedText = findStrongByLabel("예약");

    console.log(
      "[seoulLibrary] gangnam label-based values - 보유:",
      ownedText,
      "대출:",
      loanedText,
      "예약:",
      reservedText
    );

    const owned = ownedText !== undefined ? parseInt(ownedText, 10) : NaN;
    const loaned = loanedText !== undefined ? parseInt(loanedText, 10) : NaN;
    // 예약 값을 못 찾으면 0으로 간주(보수적이지 않은 방향이지만, "예약"
    // span 자체가 거의 항상 존재하는 것으로 실측 확인됐으므로 — v3/v6
    // 문서 기준 — 못 찾는 경우는 파싱 실패로 보고 별도 로그만 남김)
    const reserved = reservedText !== undefined ? parseInt(reservedText, 10) : 0;
    if (reservedText === undefined) {
      console.log(
        "[seoulLibrary] gangnam: could not find 예약 value, defaulting to 0, title:",
        r.title
      );
    }

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

    // [2026-06-21 변경] 예약 건수를 빼는 계산으로 변경.
    // 기존: remaining = owned - loaned
    // 변경: remaining = owned - loaned - reserved
    // 실측 사례("절창", 2025-09-17 문학동네): 보유5/대출3/예약10 →
    // 5-3-10=-8(음수) → 대출불가로 정정됨(기존 계산은 5-3=2로 "2권
    // 대출가능"이라는 잘못된 안내를 했었음).
    //
    // [검증 필요 — 미확정] 이 공식이 "예약 건수만큼 책이 묶인다"는 가정에
    // 기반하는데, 강남구가 실제로 이 방식으로 동작하는지, 혹은 "예약이
    // 1건이라도 있으면 무조건 대출불가"인지는 아직 실측 대조가 안 됨.
    // 현재는 "절창" 한 건의 사례로만 검증된 상태 — 더 많은 사례(특히
    // "예약 1건, 보유-대출 차이가 양수인" 경우)로 추가 검증 필요.
    const remaining = owned - loaned - reserved;
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
 * [2026-06-21 변경] 제목 비교용 정규화 — 점(.) 제거 규칙 추가.
 *
 * 실측 확인된 사례: "달러구트 꿈 백화점. 2"(구로구·강남구·마포구·서초구)
 * vs "달러구트 꿈 백화점 2"(금천구·서울시·동대문구) — 점 유무 차이로 같은
 * 책이 카드 2개로 분리됨.
 *
 * 위험 검토 결과(2026-06-21 논의), 점을 무조건 제거하면 "1.4킬로그램의
 * 우주" 같은 소수점 표기가 "14킬로그램의 우주"로 의미가 바뀌는 위험이 있어,
 * "숫자와 숫자 사이의 점(소수점으로 추정)"은 보존하고, 그 외의 점만 제거.
 *
 * 다른 구두점(콜론, 파이프 등)은 이번 범위에서 다루지 않음 — 강남구 광고
 * 카피 혼입 사례(v7 문서 4-1장)와 겹쳐 의도치 않은 부작용 위험이 있어
 * 보류, 점만 우선 좁혀서 처리(작게작게 수정하는 기조 유지).
 */
function normalizeTitle(title: string): string {
  const withoutNonDecimalDots = title.replace(/(?<!\d)\.(?!\d)/g, "");
  return withoutNonDecimalDots.replace(/\s+/g, "");
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
    return { ...rest, libraries: sortLibraryEntries(rest.libraries) };
  });
}

/**
 * [2026-06-21 추가] 도서관 줄 안에서 보유 권수(전체 권수) 추출.
 * loanInfo 텍스트 형식이 도서관 종류별로 다름:
 *   - "N/M" 형식(구로구·동대문구·마포구·금천구·서울시육아종합지원센터): M이 보유 권수
 *   - "보유 N / 대출 M" 형식(강남구·서초구): 앞의 N이 보유 권수
 *   - 그 외(서울시 전자도서관 등 정보 없음): 알 수 없음 → undefined
 */
function extractOwnedCount(loanInfo?: string): number | undefined {
  if (!loanInfo) return undefined;

  const ratioMatch = loanInfo.match(/^(\d+)\s*\/\s*(\d+)/);
  if (ratioMatch) {
    return parseInt(ratioMatch[2], 10);
  }

  const ownedMatch = loanInfo.match(/보유\s*(\d+)/);
  if (ownedMatch) {
    return parseInt(ownedMatch[1], 10);
  }

  return undefined;
}

/**
 * [2026-06-21 추가] 한 책 카드 안의 도서관 줄 정렬.
 * 사용자 요청 규칙:
 *   1순위 - 서울시 전자도서관(103291)은 항상 맨 끝 (대출가능여부 확인 불가하므로)
 *   2순위 - 대출가능 권수(loanableCount) 많은 순
 *   3순위 - 같으면 보유 권수(전체 권수) 많은 순
 *   4순위 - 그래도 같으면 원래 순서 유지(안정 정렬)
 *
 * 원래 배열의 인덱스를 같이 들고 있다가 4순위에서 사용 — Array.prototype.sort는
 * 자바스크립트 표준상 안정 정렬이 보장되지만, 비교 함수가 0을 반환하지 않으면
 * 의미가 없으므로 인덱스를 명시적으로 비교해 원래 순서를 보존함.
 */
const SEOUL_LIBRARY_DBNUM = "103291";

function sortLibraryEntries(libraries: EbookLibraryEntry[]): EbookLibraryEntry[] {
  return libraries
    .map((lib, index) => ({ lib, index }))
    .sort((a, b) => {
      const aIsSeoul = a.lib.dbnum === SEOUL_LIBRARY_DBNUM;
      const bIsSeoul = b.lib.dbnum === SEOUL_LIBRARY_DBNUM;
      if (aIsSeoul && !bIsSeoul) return 1;
      if (!aIsSeoul && bIsSeoul) return -1;
      if (aIsSeoul && bIsSeoul) return a.index - b.index;

      const aLoanable = a.lib.loanableCount ?? -1;
      const bLoanable = b.lib.loanableCount ?? -1;
      if (aLoanable !== bLoanable) return bLoanable - aLoanable;

      const aOwned = extractOwnedCount(a.lib.loanInfo) ?? -1;
      const bOwned = extractOwnedCount(b.lib.loanInfo) ?? -1;
      if (aOwned !== bOwned) return bOwned - aOwned;

      return a.index - b.index;
    })
    .map(({ lib }) => lib);
}
/**
 * ===== 아래부터는 lib/scraper/seoulLibrary.ts 맨 아래에 "추가"할 내용 =====
 *
 * 기존 파일 상단의 import 구문에 추가 필요:
 *   import { PhysicalLibrary, PhysicalBook } from "@/types";
 *   import { getNearbyDbnums, getDistrictName, DEFAULT_LOCATION } from "@/lib/data/districtCoords";
 *   import { findBranchCoord } from "@/lib/data/branchCoords";
 *   import { findBranchHours } from "@/lib/data/branchHours";
 *
 * [2026-06-23 변경] PhysicalBook 타입은 이 파일이 아니라 types/index.ts로
 * 옮김 — EbookBook과 같은 위치에 두는 게 일관적이고, 화면/API 라우트에서도
 * import해서 써야 하므로 공용 타입 파일에 두는 게 맞음. 이 파일 맨 아래에
 * 있던 `export type PhysicalBook = {...}` 정의는 제거하고 import로 대체.
 *
 * 전자책(searchEbooks)과 다른 점:
 *   - dbnum이 고정 8개가 아니라, 위치 기반으로 매번 달라짐(districtCoords 참조)
 *   - 판본 묶기 없음 — ISBN 완전일치만 사용(전자책처럼 제목/저자 정규화 불필요)
 *   - 검색 1번 = 목록 + 대출가능 정보까지 한 번에 (별도 상세조회 단계 없음)
 *   - 강남구 같은 "XML만으로 판단 불가, 상세페이지 추가조회 필요" 케이스가
 *     있는지는 아직 확인 전 — 4번 결정("구현하면서 체크")에 따라, 실제 서비스
 *     중 이상한 구가 보이면 그때 개별 대응.
 *
 * [검증 범위 — 중요] dbnum이 "구 하나 = dbnum 하나"로 충분한지는 현재까지
 * 5개 구만 직접 검증됨: 동작구(43641), 서초구(88431), 마포구(88421),
 * 강남구(50421), 양천구(44451). 5개 구 전부 "기존 dbnum 하나로 충분" 패턴
 * 으로 일치함.
 *
 * 서초구는 88431(구립통합)과 44081(작은도서관) 둘 다 단독 호출해서 응답을
 * 직접 대조했고, 44081의 16건 전부가 url까지 88431의 30건 안에 포함되는
 * 완전한 부분집합임을 데이터로 확인함.
 *
 * 마포구·강남구는 "기존 dbnum 단독 호출" 결과 안에, 의심 가는 개별 분관이
 * 이미 포함되어 있음을 직접 확인함.
 *
 * 양천구는 dbnum 자체는 문제없었으나, 종이책 dbnum 단독 호출 결과에
 * "전자자료"(전자책)가 같이 섞여 나오는 새로운 문제를 발견함 — 아래
 * parsePhysicalXml의 전자자료 필터링 참조. 표본이 늘수록 "dbnum 충분성"과는
 * 다른 차원의 새 변수가 계속 나올 수 있다는 신호로 받아들일 것.
 *
 * 나머지 20개 구는 전부 미검증. 표본이 5개로 늘면서 "기존 dbnum 하나로
 * 충분하다"는 가정의 신뢰도는 올라갔지만, 확정된 것은 아님. 아래 코드는
 * 일단 ver2 핸드오프 표의 dbnum 하나씩으로 호출하는 구조로 작성하되, 실제
 * 서비스 중 특정 구에서 결과가 누락되거나 이상한 데이터(전자책 혼입 등)가
 * 보이면 그 구에 한해 개별 대응할 것.
 *
 * "특성별"(전자도서관, 평생학습관, 영상자료원, 교육청 산하 등) 카테고리는
 * 1차 구현 범위에서 제외 — 이건 위 dbnum 포함 여부 검증과는 별개로 이미
 * 결정된 사항(교육청도서관과 동일한 취급).
 *
 * 스마트도서관(서초구에서 확인): 별도 호출 불필요. 88431 응답 안에 "내방역",
 * "양재근린공원" 등 스마트도서관이 구립/작은도서관과 함께 record로 섞여서
 * 나왔음. 다만 이것도 서초구 한 곳만 확인된 것 — 다른 구도 같은 패턴인지는
 * 미검증.
 */
type PhysicalRawRecord = {
  dbnum: string;
  dbname: string;
  title: string;
  url: string;
  author: string;
  publisher: string;
  date: string;
  isbn: string;
  image?: string;
  /**
   * [2026-06-23 실측 확인 — 동작구·서초구 응답 대조]
   * - "도서관" 필드 = 분관 이름 (예: "사당솔밭도서관", "서초4동")
   * - "Location" 필드 = 자료실명 (예: "[사당솔밭]종합자료실Ⅱ", "서초4동 작은도서관")
   *   (제가 처음에 추측했던 것과 정반대 — Location이 분관 이름이 아니라
   *   자료실명이었음. 동작구는 "분관" + "자료실"이 둘 다 있고, 서초구는
   *   "Location" 하나만 있고 "도서관" 필드 자체가 없는 경우도 있었음
   *   — 44081 응답 참조, 이 경우는 Location 안의 "OO동" 부분이 곧 분관
   *   이름을 겸하고 있어서 Location만으로도 분관 식별 가능)
   * - "Loan" 필드 = 대출가능 텍스트, 비율(N/M) 아님. 직접 한국어 문구로
   *   "대출가능" / "대출가능[비치중]" / "대출불가" / "대출불가(예약중)" /
   *   "대출불가[대출중]" / "대출불가[상호대차중]" / "대출불가[상호대차예약중]" /
   *   "대출불가[타관반납]" / "대출불가[책나르샤중]" 등 다양한 변형이 확인됨
   *   (동작구·서초구는 소괄호(), 마포구·강남구는 대괄호[] 사용 — 표기만
   *   다르고 의미는 동일). "대출가능"으로 시작하는지만 보면 충분 — 괄호
   *   안 사유와 예약 인원/반납예정일은 화면 표시용 보조정보로만 사용.
   *   [참고] 강남구는 반납예정일 표기가 "2026.06.27"(점), 다른 구는
   *   "2026-06-27"(하이픈) — 날짜를 직접 파싱해서 쓸 경우 구별로 구분 필요.
   */
  library?: string; // "도서관" 필드 (없는 도서관도 있음, 그 경우 location에서 추출)
  location?: string; // "Location" 필드 (자료실명, 또는 분관명을 겸하는 경우도 있음)
  loan?: string; // "Loan" 필드 (대출가능 여부 텍스트)
};

/**
 * [2026-06-24 변경] category1과 검색어를 파라미터로 받는 내부 공용 함수로
 * 분리. 제목 검색(searchPhysicalBooks)과 ISBN 검색(searchPhysicalBooksByIsbn)
 * 둘 다 이 함수를 거침 — 중복 코드 방지.
 *
 * [마포구 예외] 마포구(dbnum 88421)는 ISBN 검색(category1=7)을 보내면
 * 통합검색 중계가 마포구 시스템(mplib.mapo.go.kr)으로 ISBN을 제대로
 * 전달하지 못해 항상 Failed로 응답함(2026-06-24 실측 확인 — uri 파라미터
 * 안에 searchKeyword2가 빈 값으로 가는 것을 직접 확인). 반면 마포구는
 * 제목 검색(category1=1)에서는 이미 ISBN을 정상적으로 포함해서 응답하고
 * 있었음(사용자 확인). 그래서 마포구만: ISBN 검색을 먼저 시도하고,
 * resultinfo가 Failed면 그 즉시 제목 검색으로 재시도하는 fallback을 둠.
 * 마포구의 "제목"은 카카오에서 받은 후보의 title을 그대로 사용.
 */
const MAPO_DBNUM = "88421";

async function fetchDistrictsByCategory(
  dbnum: string,
  category1: string,
  searchText: string,
  fallbackTitleForMapo: string | undefined,
  id: string,
  cookie: string,
  defaultSearchUrl: string
): Promise<PhysicalRawRecord[]> {
  const buildUrl = (cat: string, text: string) => {
    const encodedText = encodeURIComponent(text);
    const searchQueryParams =
      `category1=${cat}` +
      `&category2=0&category3=0` +
      `&text1=${encodedText}&text2=&text3=` +
      `&op=0&op2=0&year1=&year2=` +
      `&dbnum=${dbnum}` +
      `&display=30&recstart=1&sort=rel`;
    return `${BASE_URL}/index.php/ajax/engine/deploy?id=${id}&${searchQueryParams}&_=${Date.now()}`;
  };

  const fetchOnce = async (cat: string, text: string): Promise<{ xml: string; ok: boolean }> => {
    const url = buildUrl(cat, text);
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
    console.log(`[seoulLibrary] physical deploy(${dbnum}, category1=${cat}) status:`, res.status);
    if (!res.ok) return { xml: "", ok: false };
    const xml = await res.text();
    const isFailed = /<resultinfo[^>]*>\s*Failed\s*<\/resultinfo>/.test(xml);
    return { xml, ok: !isFailed };
  };

  try {
    let { xml, ok } = await fetchOnce(category1, searchText);

    // 마포구 + ISBN 검색이 실패한 경우만 제목으로 재시도
    if (!ok && dbnum === MAPO_DBNUM && category1 === "7" && fallbackTitleForMapo) {
      console.log("[seoulLibrary] 마포구 ISBN 검색 실패 — 제목으로 재시도:", fallbackTitleForMapo);
      const retry = await fetchOnce("1", fallbackTitleForMapo);
      xml = retry.xml;
      ok = retry.ok;
    }

    if (!xml) return [];

    const recordCountInRaw = (xml.match(/<record/g) ?? []).length;
    const fieldNameMatches = xml.match(/<field name="([^"]+)"/g) ?? [];
    const uniqueFieldNames = Array.from(
      new Set(fieldNameMatches.map((m) => m.match(/name="([^"]+)"/)?.[1]))
    );
    console.log(
      `[DEBUG] deploy(${dbnum}) raw <record> tag count:`,
      recordCountInRaw,
      "| unique field names:",
      uniqueFieldNames
    );

    return parsePhysicalXml(xml, dbnum);
  } catch (e) {
    // [임시 디버그] 타임아웃이 매번 같은 구에서 나는지 패턴 확인용 —
    // dbnum과 구 이름을 같이 남겨서 비교하기 쉽게 함.
    console.log(
      `[DEBUG-CHECK] TIMEOUT/FAIL — dbnum: ${dbnum} (${getDistrictName(dbnum) ?? "?"}) at`,
      new Date().toISOString(),
      e
    );
    return [];
  }
}

/**
 * 종이책 검색 메인 함수 (제목 검색 — 기존 동작 그대로 유지).
 *
 * @param query 검색어 (책 제목)
 * @param userLat 사용자 위도 (없으면 DEFAULT_LOCATION 사용)
 * @param userLng 사용자 경도 (없으면 DEFAULT_LOCATION 사용)
 */
export type PhysicalSearchMeta = {
  /** "nearby"면 위치 기준 좁은 범위, "all"이면 위치 없어 25개 구 전체 검색 */
  scope: "nearby" | "all";
  /** 이번 검색이 대상으로 한 구 이름들(화면 로딩 문구에 사용) */
  districtNames: string[];
};

export type PhysicalSearchResult = {
  books: PhysicalBook[];
  meta: PhysicalSearchMeta;
};

/**
 * [2026-06-24 변경] 위치 정보 유무에 따라 검색 범위를 분기.
 *   - 위치 있음(userLat/userLng 둘 다 제공): 기존처럼 반경 5km 안의
 *     몇 개 구만 검색("nearby") — "내 근처에서 가장 빨리"라는 서비스
 *     목적에 맞고, 도서관 서버 부담도 적음.
 *   - 위치 없음: 25개 구 전체 검색("all") — 위치가 없으면 "근처"라는
 *     기준 자체가 없으므로, 좁혀서 추측하는 대신 서울 전체에서 찾을
 *     수 있는 데까지 다 보여주는 쪽을 택함(놓치는 책이 없도록).
 *
 * 반환값을 books 배열 단독에서 { books, meta } 형태로 변경 — meta에
 * scope/districtNames를 담아 API 응답에 실어서, 화면이 로딩 문구를
 * "OO구에서 검색 중"(nearby) 또는 "서울시 모든 구에서 검색 중"(all)
 * 으로 다르게 보여줄 수 있게 함.
 */
export async function searchPhysicalBooks(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<PhysicalSearchResult> {
  const hasLocation = userLat !== undefined && userLng !== undefined;
  const lat = userLat ?? DEFAULT_LOCATION.lat;
  const lng = userLng ?? DEFAULT_LOCATION.lng;

  const targetDbnums = hasLocation ? getNearbyDbnums(lat, lng) : getAllDbnums();
  const scope: "nearby" | "all" = hasLocation ? "nearby" : "all";
  const districtNames = targetDbnums
    .map((dbnum) => getDistrictName(dbnum))
    .filter((name): name is string => Boolean(name));

  console.log(
    "[seoulLibrary] searchPhysicalBooks - scope:",
    scope,
    "location:",
    { lat, lng },
    "target dbnums:",
    targetDbnums
  );

  const id = generateRequestId();
  const defaultSearchUrl = `${BASE_URL}/index.php/default_search`;

  let cookie = "";
  try {
    const res = await fetch(defaultSearchUrl, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    cookie = extractCookies(res);
  } catch (e) {
    console.log("[seoulLibrary] physical stage1 fetch failed:", e);
  }

  const resultsByDistrict = await Promise.all(
    targetDbnums.map((dbnum) =>
      fetchDistrictsByCategory(dbnum, "1", query, undefined, id, cookie, defaultSearchUrl)
    )
  );
  const rawRecords = resultsByDistrict.flat();

  console.log("[seoulLibrary] physical total parsed records:", rawRecords.length);

  const meta: PhysicalSearchMeta = { scope, districtNames };

  if (rawRecords.length === 0) return { books: [], meta };

  return { books: groupPhysicalBooksByIsbn(rawRecords), meta };
}

/**
 * [2026-06-24 추가] ISBN 기반 종이책 검색.
 * 카카오 책 검색 API로 ISBN을 먼저 확정한 뒤 이 함수를 호출 — 서울도서관
 * 응답의 ISBN 필드 유무에 의존하지 않아 송파구·성북구 문제가 발생하지
 * 않음(2026-06-24 실측 확인). title은 마포구 fallback(제목 검색 재시도)에만
 * 쓰이므로, 화면에서 사용자가 선택한 카카오 후보의 title을 그대로 넘기면 됨.
 *
 * @param isbn 13자리 ISBN
 * @param title 마포구 fallback용 제목 (카카오 후보의 title)
 * @param userLat 사용자 위도 (없으면 DEFAULT_LOCATION 사용)
 * @param userLng 사용자 경도 (없으면 DEFAULT_LOCATION 사용)
 */
export async function searchPhysicalBooksByIsbn(
  isbn: string,
  title: string,
  userLat?: number,
  userLng?: number
): Promise<PhysicalBook[]> {
  const lat = userLat ?? DEFAULT_LOCATION.lat;
  const lng = userLng ?? DEFAULT_LOCATION.lng;
  const targetDbnums = getNearbyDbnums(lat, lng);

  console.log(
    "[seoulLibrary] searchPhysicalBooksByIsbn - isbn:",
    isbn,
    "location:",
    { lat, lng },
    "target dbnums:",
    targetDbnums
  );

  const id = generateRequestId();
  const defaultSearchUrl = `${BASE_URL}/index.php/default_search`;

  let cookie = "";
  try {
    const res = await fetch(defaultSearchUrl, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    cookie = extractCookies(res);
  } catch (e) {
    console.log("[seoulLibrary] physical(isbn) stage1 fetch failed:", e);
  }

  const resultsByDistrict = await Promise.all(
    targetDbnums.map((dbnum) =>
      fetchDistrictsByCategory(dbnum, "7", isbn, title, id, cookie, defaultSearchUrl)
    )
  );
  const rawRecords = resultsByDistrict.flat();

  console.log("[seoulLibrary] physical(isbn) total parsed records:", rawRecords.length);
  if (rawRecords.length === 0) return [];

  return groupPhysicalBooksByIsbn(rawRecords);
}

/**
 * XML 파싱 — 필드 이름은 5개 구(동작구·서초구·마포구·강남구·양천구) 실제
 * 응답으로 확인됨(2026-06-23). 전자자료(전자책) 필터링 포함(양천구에서
 * 발견된 문제, 아래 참조).
 */
function parsePhysicalXml(xml: string, expectedDbnum: string): PhysicalRawRecord[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const records: PhysicalRawRecord[] = [];

  $("record").each((_: number, el: any) => {
    const dbnum = $(el).attr("dbnum") ?? "";
    const dbname = $(el).attr("dbname") ?? "";

    if (dbnum !== expectedDbnum) return;

    const field = (name: string) =>
      $(el).find(`field[name="${name}"] content`).first().text().trim();
    const fieldUrl = (name: string) =>
      $(el).find(`field[name="${name}"] url`).first().text().trim();

   const title = field("TITLE");
    const isbn = field("ISBN");
    const location = field("Location") || undefined;
    const titleUrl = fieldUrl("TITLE");
    const libraryField = field("도서관") || undefined;
    const authorField = field("Author");
    const typeField = field("Type") || undefined;

    // [2026-06-26 임시 디버그] 22개 구(ISBN 신뢰 가능 구) 전수조사 —
    // location/title/Type 중 전자책 관련 키워드가 하나라도 들어간
    // record를 전부 출력. 성동구에서 "디지털도서관(전자책)" 표기가
    // 기존 필터(location === "전자자료")를 빠져나간 게 발견됨에 따라,
    // 다른 구도 같은 패턴이 있는지 확인. 필터링(전자자료, !title)에
    // 걸리기 전 단계에서 검사 — 새는 record를 그대로 잡아야 하므로.
    const electronicKeywordHit =
      (location && /전자|디지털|e-?book|digital/i.test(location)) ||
      (title && /전자|디지털|e-?book|digital/i.test(title)) ||
      (typeField && /전자|디지털|e-?book|digital/i.test(typeField));

    if (electronicKeywordHit) {
      console.log(
        `[DEBUG-EBOOK-SCAN] dbnum: ${expectedDbnum} | title: "${title}" | location: "${location}" | type: "${typeField}" | isbn: "${isbn}"`
      );
    }

    // [2026-06-26 임시 디버그] 성동구(34141) raw record 전체 확인용 —
    // 필터링(전자자료, !title)에 걸리기 전 단계에서 받은 record를
    // 빠짐없이 전부 출력. "절창" ISBN 파싱 문제(no-isbn_34141_절창)
    // 원인 확인 목적. 원인 확정되면 제거할 것.
    if (expectedDbnum === "34141") {
      console.log(
        `[DEBUG-SEONGDONG] record — title: "${title}" | author: "${authorField}" | isbn: "${isbn}" | titleUrl: "${titleUrl}" | location: "${location}" | library필드: "${libraryField}"`
      );
    }

    // [임시 디버그] 송파구·성북구 응답에 "달러구트" 검색어가 진짜
    // 있는지 없는지 확인용 — 필터링(전자자료, !title)에 걸리기 전
    // 단계에서 모든 record의 제목을 그대로 출력.
    if (expectedDbnum === "44381" || expectedDbnum === "44301") {
      console.log(
        `[DEBUG-CHECK] raw record (dbnum: ${expectedDbnum}) — title:`,
        title,
        "| location:",
        location,
        "| isbn:",
        isbn
      );
    }

    // [2026-06-25 재수정] ISBN이 없어도 일단 살려둠 — ISBN 보강(필드→url→
    // 제목/저자 합류→독립카드)은 groupPhysicalBooksByIsbn에서 처리.
    // 여기서 미리 걸러버리면 그 보강 로직 자체가 실행될 기회가 없어짐.
    // (이전에 이 수정을 했었으나 어느 시점에 되돌아가 있었음 — 재적용)
    if (!title) return;

    // [2026-06-23 양천구(44451) 실측 확인] 종이책 dbnum 단독 호출 결과에
    // "전자자료"(전자책)가 같이 섞여 나오는 경우가 있음 — 제목에
    // "[전자자료]"가 붙고 Location 필드가 정확히 "전자자료", ISBN도 종이책과
    // 다름. 종이책 검색 화면에 전자책이 섞여 나오면 혼란을 주므로 제외.
    if (location === "전자자료" || title.includes("[전자자료]")) return;

    records.push({
      dbnum,
      dbname,
      title,
      url: fieldUrl("TITLE"),
      author: field("Author"),
      publisher: field("Publication"),
      date: field("Date"),
      isbn,
      image: field("Image") || undefined,
      library: field("도서관") || undefined,
      location,
      loan: field("Loan") || undefined,
    });
  });

  return records;
}

/**
 * 분관 이름 결정 — "도서관" 필드가 있으면 그걸 쓰고, 없으면(서초구 작은
 * 도서관 dbnum=44081 사례처럼) Location 필드에서 추출.
 * Location 예시: "서초4동 작은도서관" → "서초4동", "[사당솔밭]종합자료실Ⅱ"
 * → 이 경우는 "도서관" 필드가 따로 있어서 이 fallback을 안 타지만, 혹시
 * 다른 구에서 비슷한 "[이름]자료실" 형식만 있고 "도서관" 필드가 없는
 * 경우를 대비해 괄호 안 이름도 추출 시도.
 */
function extractLibraryName(r: PhysicalRawRecord): string {
  if (r.library) return r.library;
  if (r.location) {
    // "[사당솔밭]종합자료실Ⅱ" 형식 → 괄호 안 이름 추출
    const bracketMatch = r.location.match(/^\[([^\]]+)\]/);
    if (bracketMatch) return bracketMatch[1];
    // "서초4동 작은도서관" 형식 → 첫 단어(동 이름 등) 추출
    const firstWordMatch = r.location.match(/^(\S+)/);
    if (firstWordMatch) return firstWordMatch[1];
  }
  return r.dbname; // 최후 수단 — 구 단위 이름
}

/**
 * [2026-06-24 추가] 분관 이름 안의 문구로 도서관 유형 추론.
 *
 * 종이책 통합검색은 동작구 ver1과 달리 구립/작은/스마트도서관이 한
 * 응답(dbnum)에 섞여서 나오고, 별도 유형 필드가 없음(v10 문서 5장:
 * "스마트도서관 별도 처리 불필요, dbnum 통합검색에 이미 포함되어 나옴"
 * 이라고만 적혀 있고, 그 안에서 유형을 구분하는 작업은 아직 안 함).
 *
 * 100% 정확하지는 않음 — "작은"이나 "스마트"라는 글자가 이름에 없는
 * 분관은 구립으로 분류됨(예: 정식 명칭에 "작은도서관"이 안 들어가는
 * 경우). 정확하지 않은 채로 색 구분을 보여주는 게, 전부 한 색으로
 * 보여주는 것보다는 사용자에게 더 유용한 정보라고 판단해 1차로 적용.
 * 추후 branchHours.ts의 정식 명단(slib-hours.json)에 있는 "type" 필드를
 * 보조 신호로 같이 쓰면 정확도를 더 높일 수 있어 보임(다음 개선 후보).
 */
function inferLibraryType(branchName: string): LibraryType {
  if (branchName.includes("스마트도서관") || branchName.includes("스마트")) {
    return "smart_library";
  }
  if (branchName.includes("작은도서관") || branchName.includes("작은")) {
    return "small_library";
  }
  return "library";
}

/**
 * [2026-06-23 실측 확정] Loan 필드는 "대출가능" 또는 "대출불가(사유)" 형식의
 * 한국어 텍스트. 비율(N/M)이 아니므로 전자책의 반전 버그 같은 위험이 없음.
 * "대출가능"으로 시작하면 가능, 그 외(대출불가 + 모든 변형)는 불가.
 */
function isPhysicalAvailable(r: PhysicalRawRecord): boolean {
  if (!r.loan) return false;
  return r.loan.startsWith("대출가능");
}

/**
 * [2026-06-23 실측 확인] ISBN 필드에 부가기호가 공백으로 붙어 나오는 경우가
 * 있음 (예: "9791141602451 03810"). 부가기호는 같은 책이라도 인쇄 시점/공급
 * 단위에 따라 붙거나 안 붙을 수 있어, 핵심 13자리 ISBN만 비교 기준으로 삼고
 * 부가기호는 버림 — 안 그러면 같은 책이 ISBN 표기 차이로 다른 책처럼 분리됨.
 */
function normalizeIsbn(raw: string): string {
  return raw.trim().split(/\s+/)[0];
}

/**
 * [2026-06-24 추가] ISBN 필드 자체가 없는 구(송파구·성북구·강동구·
 * 서대문구, 이슈 D 확장)를 위한 보조 추출 — TITLE 필드의 url 안에
 * "isbn=9788983..." 형태로 ISBN이 박혀있는 경우가 있음(2026-06-24
 * 실측 확인). 강동구·서대문구는 전체 record에서 일관되게 이 패턴으로
 * ISBN을 뽑아낼 수 있었음. 송파구·성북구는 이 방법도 안 통함(URL에도
 * ISBN이 없는 record가 대부분) — 그 경우는 groupPhysicalBooksByIsbn의
 * 합류 로직(아래 참조)으로 처리.
 *
 * isbn= 뒤에 오는 값이 13자리 숫자가 아닐 수도 있어(10자리 구ISBN,
 * 또는 X로 끝나는 옛 표기) 길이를 강제하지 않고 &(다음 파라미터 구분자)
 * 전까지를 그대로 받음 — normalizeIsbn처럼 부가기호 분리 처리는
 * 호출부에서 필요시 추가.
 */
function extractIsbnFromUrl(url: string | undefined): string {
  if (!url) return "";
  const match = url.match(/[?&]isbn=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * [2026-06-23 실측 확인] 강남구·마포구 응답의 Loan 텍스트 안에 반납예정일이
 * 같이 박혀 나오는 경우가 있음(예: "대출불가[대출중](예약: 3명)(반납예정일:
 * 2026.07.01)", "대출불가[대출예약중] (예약: 5명 / 예약가능인원 : 5명)
 * (반납예정일: 2026-06-27)"). 날짜 구분자가 구마다 다름(강남구는 점,
 * 다른 구는 하이픈) — 둘 다 매칭되도록 구분자 문자 클래스로 처리.
 * 반납예정일이 없는 변형(예: "대출불가[상호대차예약중]")도 있으므로 못
 * 찾으면 undefined.
 */
function extractReturnDueDate(loan?: string): string | undefined {
  if (!loan) return undefined;
  const match = loan.match(/반납예정일\s*:\s*([\d.\-]+)/);
  return match ? match[1] : undefined;
}

/**
 * ISBN 완전일치로만 묶기 — 5번 결정: "종이책은 무조건 ISBN 기준 사용,
 * 전자책의 제목/저자 정규화·정규식 보호장치는 ISBN이 없어서 만든 우회수단
 * 이었으므로 종이책에는 불필요."
 *
 * 같은 ISBN, 같은 dbnum(구) 안에 여러 행이 있으면(동작구 dongjak.ts의
 * "한 도서관에 같은 책 여러 권" 패턴과 동일) 분관별로 나눠서 보여줌 — 동작구
 * dongjak.ts와 달리, 종이책 통합검색은 분관 단위(record 1건)가 이미 분관별로
 * 쪼개져 있으므로 별도 "같은 도서관 집계" 단계 없이 그대로 1개 분관 = 1개
 * PhysicalLibrary로 매핑.
 */
/**
 * [2026-06-24 변경] ISBN 확보 우선순위를 3단계로 확장:
 *   1순위: TITLE/ISBN 필드에서 그대로 (대부분의 구)
 *   2순위: ISBN 필드가 비어있으면 TITLE의 url에서 추출(강동구·서대문구
 *          처럼 필드는 없지만 url에는 있는 구)
 *   3순위: 그래도 없으면(송파구·성북구처럼 필드/url 둘 다 없는 구)
 *          "제목+저자가 일치하는, 이미 ISBN이 확정된 그룹"에 합류시킴
 *          — 전자책 groupBooks의 "저자 빈 문자열 항목을 제목+출판사로
 *          합류시키는" 패턴과 같은 발상.
 *   4순위: 합류할 그룹도 없으면(그 책이 정말 그 구에만 있는 경우)
 *          ISBN 없는 채로 독립 카드 유지 — "구 이름+제목+저자"를 임시
 *          키로 사용(여러 도서관이 한 카드에 모이는 효과는 사라지지만,
 *          최소한 화면에서 사라지지는 않음).
 *
 * 같은 ISBN, 같은 dbnum(구) 안에 여러 행이 있으면 분관별로 나눠서
 * 보여줌 — 기존 동작과 동일.
 */
function groupPhysicalBooksByIsbn(records: PhysicalRawRecord[]): PhysicalBook[] {
  console.log("[DEBUG] groupPhysicalBooksByIsbn 시작, records:", records.length);

  // 1단계: 각 record의 최종 ISBN을 확정 (필드 → url 순으로 시도)
  const withResolvedIsbn = records.map((r) => {
    const fieldIsbn = normalizeIsbn(r.isbn);
    if (fieldIsbn) {
      return { record: r, resolvedIsbn: fieldIsbn, isbnSource: "field" as const };
    }
    const urlIsbn = extractIsbnFromUrl(r.url);
    if (urlIsbn) {
      console.log(
        "[DEBUG] ISBN 필드 없음, url에서 추출 성공 — dbnum:",
        r.dbnum,
        "title:",
        r.title,
        "extracted:",
        urlIsbn
      );
      return { record: r, resolvedIsbn: normalizeIsbn(urlIsbn), isbnSource: "url" as const };
    }
    return { record: r, resolvedIsbn: "", isbnSource: "none" as const };
  });

  const withIsbn = withResolvedIsbn.filter((x) => x.resolvedIsbn);
  const withoutIsbn = withResolvedIsbn.filter((x) => !x.resolvedIsbn);

  console.log(
    "[DEBUG] ISBN 확보:",
    withIsbn.length,
    "건 / ISBN 없음(합류 시도 대상):",
    withoutIsbn.length,
    "건"
  );

  // 2단계: ISBN이 확보된 record들로 먼저 그룹을 만듦
  const byIsbn = new Map<string, PhysicalRawRecord[]>();
  for (const { record, resolvedIsbn } of withIsbn) {
    const list = byIsbn.get(resolvedIsbn) ?? [];
    list.push(record);
    byIsbn.set(resolvedIsbn, list);
  }

 // 정규화 비교용 — 전자책 normalizeTitle과 같은 발상이나, 종이책
  // 제목엔 권수 표시(". 2", " 2" 등 숫자)가 의미를 가지므로 숫자는
  // 보존하고 공백·구두점만 제거.
  // [2026-06-25 추가] 성북구처럼 제목 맨 앞에 순번("1. ", "13. " 등)이
  // 붙는 구가 있어, 다른 구의 같은 책(번호 없음)과 제목이 안 맞아
  // 3순위 합류가 실패하던 문제 — 맨 앞 "숫자. " 패턴만 제거(중간에 있는
  // 권수 숫자, 예: ". 2"는 맨 앞이 아니므로 영향 없음).
  const normalizeForMatch = (s: string) =>
    s.replace(/^\d+\.\s*/, "").replace(/[\s.,:|\-]/g, "");

  // 3단계: ISBN 없는 record들을 "제목+저자 일치" 기존 그룹에 합류 시도
  const unmatched: PhysicalRawRecord[] = [];
  for (const { record } of withoutIsbn) {
    const targetTitle = normalizeForMatch(record.title);
    const targetAuthor = normalizeForMatch(record.author);

    let matchedIsbn: string | undefined;
    for (const [isbn, recordsForIsbn] of byIsbn) {
      const sample = recordsForIsbn[0];
      if (
        normalizeForMatch(sample.title) === targetTitle &&
        normalizeForMatch(sample.author) === targetAuthor
      ) {
        matchedIsbn = isbn;
        break;
      }
    }

    if (matchedIsbn) {
      console.log(
        "[DEBUG] ISBN 없는 record 합류 성공 — dbnum:",
        record.dbnum,
        "title:",
        record.title,
        "→ isbn:",
        matchedIsbn
      );
      byIsbn.get(matchedIsbn)!.push(record);
    } else {
      unmatched.push(record);
    }
  }

  console.log(
    "[DEBUG] 합류 실패(독립 카드로 유지):",
    unmatched.length,
    "건 — 송파구·성북구처럼 ISBN도 url도 없고, 다른 구에 같은 책도 없는 경우"
  );

  console.log("[DEBUG] byIsbn 그룹 수:", byIsbn.size);

  const books: PhysicalBook[] = [];

  const buildLibrary = (r: PhysicalRawRecord): PhysicalLibrary => {
    const branchName = extractLibraryName(r);
    const guName = getDistrictName(r.dbnum);
    const coord = findBranchCoord(branchName, guName);
    const hoursInfo = guName ? findBranchHours(branchName, guName) : undefined;

    // [임시 디버그] 좌표 매칭 실패 건을 구별로 모아 보기 위한 로그.
    // extractLibraryName이 뽑은 이름과 좌표 데이터의 표기가 달라
    // findBranchCoord가 못 찾으면 lat/lng가 0이 되고, 화면에서 조용히
    // 마커가 빠짐 — 어느 구·어떤 이름에서 이게 일어나는지 확인용.
    if (!coord) {
      console.log(
        `[DEBUG-COORD-MISS] gu: ${guName ?? "?"} | extracted branchName: "${branchName}" | raw location: "${r.location ?? ""}" | raw 도서관필드: "${r.library ?? ""}"`
      );
    }

    return {
      id: `seoul_${r.dbnum}_${branchName}`,
      libraryName: branchName,
      libraryType: inferLibraryType(branchName),
      address: hoursInfo?.address ?? "",
      latitude: coord?.lat ?? 0,
      longitude: coord?.lng ?? 0,
      tel: hoursInfo?.tel,
      openingHours: hoursInfo?.hours,
      available: isPhysicalAvailable(r),
      callNumber: r.location,
      returnDueDate: isPhysicalAvailable(r) ? undefined : extractReturnDueDate(r.loan),
      searchResultUrl: r.url || undefined,
    };
  };

  for (const [isbn, recordsForIsbn] of byIsbn) {
    const first = recordsForIsbn[0];
    const libraries = recordsForIsbn.map(buildLibrary);

    books.push({
      isbn,
      title: first.title,
      author: first.author,
      publisher: first.publisher || undefined,
      publishYear: parseInt(first.date.match(/\d{4}/)?.[0] ?? "0", 10) || undefined,
      coverImage: first.image,
      libraries,
    });
  }

  // 4단계: 합류 실패한 record들 — ISBN 없이 독립 카드. 구+제목+저자를
  // 묶음 키로 써서, 같은 책이 같은 구의 여러 분관에 있으면 한 카드로는
  // 모아주되, 다른 구의 같은 책과는 못 합쳐짐(애초에 ISBN 확보가
  // 불가능했던 경우라 어쩔 수 없는 한계).
  const unmatchedGroups = new Map<string, PhysicalRawRecord[]>();
  for (const r of unmatched) {
    const key = `${r.dbnum}__${normalizeForMatch(r.title)}__${normalizeForMatch(r.author)}`;
    const list = unmatchedGroups.get(key) ?? [];
    list.push(r);
    unmatchedGroups.set(key, list);
  }

  for (const recordsForGroup of unmatchedGroups.values()) {
    const first = recordsForGroup[0];
    const libraries = recordsForGroup.map(buildLibrary);

    books.push({
      // ISBN이 끝내 없으므로 임시 식별자 사용 — 화면에서 ISBN을 키로
      // 쓰는 곳(React key, 지도 라우트 등)에 영향 줄 수 있음을 인지.
      isbn: `no-isbn_${first.dbnum}_${normalizeForMatch(first.title)}`,
      title: first.title,
      author: first.author,
      publisher: first.publisher || undefined,
      publishYear: parseInt(first.date.match(/\d{4}/)?.[0] ?? "0", 10) || undefined,
      coverImage: first.image,
      libraries,
    });
  }

  console.log("[DEBUG] groupPhysicalBooksByIsbn 끝, books:", books.length);
  // [임시 디버그] 각 책이 어느 구(dbnum) 도서관을 포함하는지 확인 —
  // 송파구(44381)·성북구(44301)가 최종 books 배열까지 살아있는지 검증용.
  for (const b of books) {
    const dbnumsInBook = Array.from(new Set(b.libraries.map((l) => l.id.split("_")[1])));
    console.log(
      "[DEBUG-CHECK] book:",
      b.title,
      "isbn:",
      b.isbn,
      "dbnums:",
      dbnumsInBook
    );
  }
  return books;
}