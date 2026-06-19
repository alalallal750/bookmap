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
  console.log("[seoulLibrary] CODE VERSION MARKER: v9-title-only-20260619");

  const id = generateRequestId();
  console.log("[seoulLibrary] generated id (shared across all dbnum calls):", id);

  // 1단계: default_search 방문 — ls_session 쿠키 확보 (도서관별 호출 전 1회만)
  const defaultSearchUrl = `${BASE_URL}/index.php/default_search`;

  let cookie = "";
  try {
    const res = await fetch(defaultSearchUrl, {
      signal: AbortSignal.timeout(8000),
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
        signal: AbortSignal.timeout(8000),
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

      if (!xml.includes("Success")) {
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
      const available = (r.state ?? "").includes("대출가능");
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.state };
    }

    case "45111": {
      const available = (r.loan ?? "").includes("대출가능");
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan };
    }

    case "45351":
    case "44891": {
      const available = isRatioAvailable(r.loan);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loan };
    }

    case "45051": {
      const available = isRatioAvailable(r.loanKorean);
      return { dbnum: r.dbnum, libraryName, available, url: r.url, loanInfo: r.loanKorean };
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
        loanInfo: "대출가능 여부는 사이트에서 직접 확인해 주세요",
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
 * 강남구 상세페이지 추가조회 — handoff 6-1장 (변경 없음)
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
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log("[seoulLibrary] gangnam detail page status:", res.status, "url:", r.url);
    if (!res.ok) {
      console.log("[seoulLibrary] gangnam: detail page fetch not ok, title:", r.title);
      return null;
    }
    const html = await res.text();
    console.log("[seoulLibrary] gangnam detail html length:", html.length);

    const $ = cheerio.load(html);

    // [2026-06-19 수정] 강남구 사이트가 EUC-KR로 한글을 보내는 것으로 추정됨
    // (실측: "보유"/"대출"/"예약" 한글이 ???? 형태로 깨져서 들어옴, 숫자는 정상).
    // 한글 라벨로 찾는 대신, "div.current 안의 <strong> 태그들"을 순서대로 가져옴.
    // 실측으로 확인된 순서: 1번째 = 보유, 2번째 = 대출, 3번째 = 예약.
    const strongTexts = $("div.current strong")
      .map((_: number, el: any) => $(el).text().trim())
      .get();

    console.log("[seoulLibrary] gangnam strong tag values (순서: 보유, 대출, 예약):", strongTexts);

    const owned = strongTexts[0] !== undefined ? parseInt(strongTexts[0], 10) : NaN;
    const loaned = strongTexts[1] !== undefined ? parseInt(strongTexts[1], 10) : NaN;

    if (Number.isNaN(owned) || Number.isNaN(loaned)) {
      console.log(
        "[seoulLibrary] gangnam: could not parse owned/loaned numbers, title:",
        r.title,
        "- strongTexts:",
        strongTexts
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
    };
  } catch (e) {
    console.log("[seoulLibrary] gangnam detail fetch threw error, title:", r.title, "error:", e);
    return null;
  }
}

/**
 * 서울시육아종합지원센터 상세페이지 추가조회 — handoff 6장 "표시 형식 미확인" 항목
 * 해결, 2026-06-19 실측으로 패턴 확인
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
      signal: AbortSignal.timeout(8000),
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
        loanInfo: "대출가능 여부 확인 필요(사이트에서 직접 확인해 주세요)",
      };
    }

    return {
      dbnum: r.dbnum,
      libraryName,
      available,
      url: r.url,
      loanInfo: loanText,
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
 * 판본 묶기 — handoff 7장 (변경 없음)
 */
function groupBooks(items: { raw: RawRecord; entry: EbookLibraryEntry }[]): EbookBook[] {
  const normalize = (s: string) => s.replace(/\s+/g, "");

  const groups = new Map<string, EbookBook>();

  for (const { raw, entry } of items) {
    const key = `${normalize(raw.title)}__${normalize(raw.author)}`;
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
      });
    }
  }

  return Array.from(groups.values());
}