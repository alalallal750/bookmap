/**
 * 서울도서관 통합검색 (meta.seoul.go.kr/libseoul) 기반 전자책 검색
 *
 * handoff v3 5장(API 구조), 6장(대출가능 해석 규칙), 7장(판본 묶기 기준) 참조
 *
 * [2026-06-19 대폭 수정] 흐름을 완전히 재발견함.
 *
 * 기존(실패) 가설: default_search/advanced_search → result → all_result 순으로
 * 호출해야 하고, 그 과정에 JSESSIONID/WL_PCID라는 쿠키가 반드시 필요하다고 추정했음.
 * 실제 브라우저 Network 탭을 한 단계씩 다시 캡처해본 결과, 이 가설 자체가 틀렸음이
 * 밝혀짐:
 *
 *   1. default_search 페이지 방문 (검색대상 도서관 설정 화면) — ls_session 쿠키만 받음
 *   2. 검색어 입력 후 검색 버튼 클릭 시, 브라우저가 동시에 여러 요청을 보냄:
 *      - ajax/stat/search   : 통계 기록용 (검색 자체와 무관, 호출 안 해도 됨)
 *      - ajax/search_history/add : "최근 검색기록" 보관용 (무관, 호출 안 해도 됨)
 *      - ajax/engine/deploy : ★ 진짜 핵심. 이 요청의 응답 자체에 검색 결과 XML이
 *                              전부 포함되어 있음 (<resultinfo>Success</resultinfo>
 *                              + <record> 목록). 실측으로 JSESSIONID, WL_PCID
 *                              쿠키 없이 ls_session만으로도 200 + Success 응답을
 *                              받는 것을 확인함(2026-06-19).
 *      - result (HTML 페이지) : 사용자에게 보여줄 화면일 뿐, 데이터는 deploy가
 *                              이미 갖고 있으므로 우리 코드 입장에서는 불필요.
 *      - all_result : result 화면이 새로고침/재조회할 때 쓰는 후속 요청으로 추정.
 *                     최초 검색에는 불필요.
 *
 * → 결론: default_search 한 번 방문해서 쿠키를 받고, 곧바로 deploy를 호출하면
 *         검색 결과를 받을 수 있음. JSESSIONID/WL_PCID 위조 시도는 더 이상 불필요.
 *
 * [실험적 요소 표시] default_search 방문이 실제로 꼭 필요한지(혹은 ls_session 없이
 * deploy만 단독 호출해도 되는지)는 아직 실측 검증 전. 일단 안전하게 default_search
 * 방문을 유지하고, 콘솔 로그로 결과를 보면서 다음에 더 단순화할 수 있는지 판단할 것.
 */

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
 * (이번 deploy 캡처에서도 178183510349793 형태로 동일 패턴 재확인됨 — 15자리,
 *  앞부분이 밀리초 단위 시각과 일치)
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
 * 전자책 검색 메인 함수 (v2 — deploy 단일 호출 방식)
 */
export async function searchEbooks(
  query: string,
  category: SearchCategory
): Promise<EbookBook[]> {
  console.log("[seoulLibrary] CODE VERSION MARKER: v5-deploy-20260619");

  const id = generateRequestId();
  const dbnumParam = EBOOK_DBNUMS.join("%20");

  console.log("[seoulLibrary] generated id:", id);

  const searchQueryParams =
    `category1=${CATEGORY[category]}` +
    `&category2=0&category3=0` +
    `&text1=${encodeURIComponent(query)}&text2=&text3=` +
    `&op=0&op2=0&year1=&year2=` +
    `&dbnum=${dbnumParam}` +
    `&display=30&recstart=1&sort=rel`;

  // 1단계: default_search 방문 — ls_session 쿠키 확보
  // [실험적 요소] 이 단계가 실제로 필요한지는 아직 검증 전. 일단 안전하게 유지.
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
    // 실패해도 deploy를 시도해볼 가치는 있음 (쿠키 없이도 될 가능성 확인 차원)
  }

  // 2단계: deploy 호출 — 이 응답 자체에 검색 결과 XML이 들어있음
  const deployUrl =
    `${BASE_URL}/index.php/ajax/engine/deploy` +
    `?id=${id}&${searchQueryParams}&_=${Date.now()}`;

  let xml: string;
  try {
    const res = await fetch(deployUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(cookie ? { Cookie: cookie } : {}),
        "X-Requested-With": "XMLHttpRequest",
        Referer: defaultSearchUrl,
        Accept: "text/xml, application/xml, */*",
      },
    });
    console.log("[seoulLibrary] stage2 (deploy) status:", res.status);
    if (!res.ok) return [];
    xml = await res.text();
    console.log("[seoulLibrary] stage2 xml length:", xml.length);
    console.log("[seoulLibrary] stage2 xml preview:", xml.slice(0, 1500));
  } catch (e) {
    console.log("[seoulLibrary] stage2 fetch failed:", e);
    return [];
  }

  // resultinfo의 성공 여부 확인 (간단 텍스트 체크 — 정식 파싱은 parseXml에서)
  if (!xml.includes("Success")) {
    console.log("[seoulLibrary] resultinfo did not report Success - check response");
  }

  const rawRecords = parseXml(xml);
  console.log("[seoulLibrary] parsed records count:", rawRecords.length);
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
 * XML 파싱 — deploy 응답 구조 기준
 *
 * [2026-06-19 변경] deploy 응답은 <resultdata><record>...</record></resultdata>
 * 구조로, 기존 all_result가 주던 구조(<record>가 최상위 바로 아래)와 동일한 형태의
 * record/field 패턴을 그대로 사용함. 따라서 파싱 로직 자체는 거의 그대로 재사용 가능.
 * 다만 cheerio의 xmlMode가 CDATA를 다루는 방식이 동작 환경에 따라 다를 수 있어
 * 정규식 기반 경량 파서로 교체함 (의존성도 줄어듦).
 */
function parseXml(xml: string): RawRecord[] {
  const records: RawRecord[] = [];

  // <record ...> ... </record> 블록 단위로 분리
  const recordBlocks = xml.match(/<record\b[^>]*>[\s\S]*?<\/record>/g) ?? [];

  for (const block of recordBlocks) {
    const dbnumMatch = block.match(/dbnum="([^"]*)"/);
    const dbnameMatch = block.match(/dbname="([^"]*)"/);
    const dbnum = dbnumMatch?.[1] ?? "";
    const dbname = dbnameMatch?.[1] ?? "";

    // 우리가 요청한 7개 전자도서관 외의 결과는 무시
    if (!EBOOK_DBNUMS.includes(dbnum)) continue;

    const field = (name: string): string => {
      const re = new RegExp(
        `<field name="${name}"[^>]*>[\\s\\S]*?<content><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/content>`,
      );
      const m = block.match(re);
      return m?.[1]?.trim() ?? "";
    };

    const fieldUrl = (name: string): string => {
      const re = new RegExp(
        `<field name="${name}"[^>]*>[\\s\\S]*?<url><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/url>`,
      );
      const m = block.match(re);
      return m?.[1]?.trim() ?? "";
    };

    const title = field("TITLE");
    if (!title) continue;

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
  }

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
  if (!r.url) return null;

  try {
    const res = await fetch(r.url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ownedMatch = html.match(/보유\s*<strong>(\d+)<\/strong>/);
    const loanMatch = html.match(/대출\s*<strong>(\d+)<\/strong>/);

    const owned = ownedMatch ? parseInt(ownedMatch[1], 10) : NaN;
    const loaned = loanMatch ? parseInt(loanMatch[1], 10) : NaN;
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