/**
 * 서울도서관 통합검색 (meta.seoul.go.kr/libseoul) 기반 전자책 검색
 *
 * handoff v3 5장(API 구조), 6장(대출가능 해석 규칙), 7장(판본 묶기 기준) 참조
 *
 * [2026-06-19 v5 변경] deploy 엔드포인트 발견 — default_search 방문 후 deploy 한 번
 * 호출하면 그 응답 자체에 검색 결과 XML이 들어있음을 확인함 (result/all_result/
 * JSESSIONID·WL_PCID 위조는 전부 불필요했음).
 *
 * [2026-06-19 v6 변경 — 이번 버전] dbnum을 7개 한꺼번에 넣어 deploy를 "1번" 호출하면,
 * 7개 도서관 중 그때그때 무작위로 "딱 1곳"의 결과만 돌아온다는 것을 실측으로 확인함
 * (같은 id로 9번 연속 호출 → 4개 도서관만 등장, 일부는 3~4회 중복, 3개 도서관은 한
 * 번도 안 나옴). 즉 "여러 도서관을 한 요청에 합쳐 보내기"는 신뢰할 수 없는 방식임.
 *
 * → 해결: dbnum 1개씩, 도서관 수만큼(7번) deploy를 "동시에" 호출(Promise.all)하고
 *   결과를 모아서 합치는 방식으로 변경. 실측으로 dbnum을 1개만 넣었을 때는 그 도서관의
 *   결과가 정확하고 안정적으로 돌아오는 것을 확인함(금천구 단독 테스트 사례).
 *
 *   동시에 보내므로, 전체 소요 시간은 "가장 느린 도서관 1곳"의 응답 시간과 비슷한
 *   수준일 것으로 예상됨(순차 호출 시 7배 느려지는 것을 피함). 다만 실제 배포
 *   환경(Vercel)에서의 체감 속도는 재측정 필요.
 *
 * 흐름:
 *   1. default_search 페이지 방문 → ls_session 쿠키 확보
 *   2. EBOOK_DBNUMS 각각에 대해 deploy를 동시에 호출 (dbnum 파라미터에 1개씩만)
 *   3. 7개 응답을 모두 모아서 합친 뒤, 도서관별(dbnum) 해석 규칙 적용해 대출가능
 *      여부 판단
 *   4. 강남구는 상세페이지 추가조회 필요 (XML만으로 판단 불가)
 *   5. 제목+저자 완전일치 기준으로 같은 책 묶기 (+ 출판일 보조기준)
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
 * id 생성 — handoff v4 실측 확정: 13자리 밀리초 타임스탬프 + 5자리 임의숫자
 *
 * [주의] 이번 버전에서는 도서관별로 deploy를 따로 호출하지만, 같은 검색 1건으로
 * 취급되어야 하므로 7개 요청 모두 "같은 id"를 사용함 (도서관마다 다른 id를 쓰면
 * 서버가 서로 다른 검색으로 인식할 가능성을 배제하기 위함 — 실측 검증 전 안전한
 * 선택).
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
 * 전자책 검색 메인 함수 (v6 — dbnum별 병렬 deploy 호출 방식)
 */
export async function searchEbooks(
  query: string,
  category: SearchCategory
): Promise<EbookBook[]> {
  console.log("[seoulLibrary] CODE VERSION MARKER: v6-parallel-deploy-20260619");

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
  const buildDeployUrl = (dbnum: string) => {
    const searchQueryParams =
      `category1=${CATEGORY[category]}` +
      `&category2=0&category3=0` +
      `&text1=${encodeURIComponent(query)}&text2=&text3=` +
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

    const ownedText = $("div.current span:contains('보유') strong").first().text().trim();
    const loanText = $("div.current span:contains('대출') strong").first().text().trim();

    console.log("[seoulLibrary] gangnam parsed ownedText:", JSON.stringify(ownedText), "loanText:", JSON.stringify(loanText));

    const owned = parseInt(ownedText, 10);
    const loaned = parseInt(loanText, 10);
    if (Number.isNaN(owned) || Number.isNaN(loaned)) {
      console.log(
        "[seoulLibrary] gangnam: could not parse owned/loaned numbers, title:",
        r.title,
        "- html snippet around 'div.current':",
        html.includes("div") ? $("div.current").first().html()?.slice(0, 500) : "(no div found)"
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