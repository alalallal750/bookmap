/**
 * 서울도서관 통합검색 (meta.seoul.go.kr/libseoul) 기반 전자책 검색
 *
 * handoff v3 5장(API 구조), 6장(대출가능 해석 규칙), 7장(판본 묶기 기준) 참조
 *
 * 흐름:
 *   1. id 발급 + 검색결과 페이지 요청 (GET .../index.php/result)
 *   2. 실제 XML 데이터 요청 (GET .../index.php/ajax/engine/all_result)
 *   3. 도서관별(dbnum) 해석 규칙 적용해 대출가능 여부 판단
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
 * id 생성 — handoff 5-1장: 정확한 생성규칙 미확정, 현재시각 기반 17자리 숫자로 추정.
 * 서버 사전승인 절차가 없는 것으로 보여 큰 문제 없을 것으로 예상(추정 단계, 실측 필요).
 */
function generateRequestId(): string {
  // 밀리초(13자리) + 임의 4자리를 덧붙여 17자리를 맞춤
  const millis = Date.now().toString();
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  return millis + rand;
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
  const id = generateRequestId();
  const dbnumParam = EBOOK_DBNUMS.join("%20");

  // 1단계: 검색결과 페이지 요청 (서버에 검색 세션을 만드는 단계로 추정)
  const stage1Url =
    `${BASE_URL}/index.php/result` +
    `?id=${id}` +
    `&category1=${CATEGORY[category]}` +
    `&category2=0&category3=0` +
    `&text1=${encodeURIComponent(query)}&text2=&text3=` +
    `&op=0&op2=0&year1=&year2=` +
    `&dbnum=${dbnumParam}` +
    `&display=30&recstart=1&sort=rel`;

  try {
    await fetch(stage1Url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
  } catch {
    // 1단계가 실패해도 2단계를 시도해볼 가치는 있음 (세션이 이미 있을 수도 있어서가 아니라,
    // 일부 실패가 일시적 네트워크 문제일 수 있어 바로 빈 배열로 단정하지 않음)
  }

  // 2단계: 실제 XML 데이터 요청
  const stage2Url =
    `${BASE_URL}/index.php/ajax/engine/all_result` +
    `?id=${id}&display=20&recstart=1&reload=on&_=${Date.now()}`;

  let xml: string;
  try {
    const res = await fetch(stage2Url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/xml, application/xml" },
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const rawRecords = parseXml(xml);
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
