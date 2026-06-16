/**
 * 동작구 통합도서관 (lib.dongjak.go.kr) HTML 파서
 * HTML 소스 직접 분석 기반
 *
 * 핵심 구조:
 *   div.row 마다 도서 소장 1건
 *   - a.name.goDetail[isbn] → 제목, ISBN
 *   - div.thumb img → 표지
 *   - p > font:contains("저자") → 저자
 *   - p > font:contains("출판정보") → 출판사, 연도
 *   - p > font:contains("소장도서관") → 소장도서관명
 *   - p > font:contains("자료실명") → 자료실
 *   - table.statusBox tbody td:eq(0) → 대출가능여부
 *   - table.statusBox tbody td:eq(1) → 반납예정일
 */

import * as cheerio from "cheerio";
import { Book, PhysicalLibrary } from "@/types";
import { DONGJAK_LIBRARIES } from "@/constants/libraries";

const BASE_URL = "https://lib.dongjak.go.kr";

const ALL_LIBRARY_CODES = [
  "lib_MA","lib_MD","lib_MF","lib_ME","lib_MH","lib_MJ",
  "lib_MK","lib_ML","lib_MC","lib_MN","lib_MP",
  "lib_NA","lib_NB","lib_NH","lib_NJ","lib_NK","lib_NM",
  "lib_NC","lib_ND","lib_NE","lib_NF","lib_NQ","lib_NG","lib_NN",
  "lib_PG","lib_PE","lib_PC","lib_PH","lib_PF","lib_PB","lib_PJ","lib_NR",
].join(",");

/**
 * 도서 검색 — ISBN 중복 제거 후 대표 1건씩 반환
 */
export async function searchBooks(query: string): Promise<Book[]> {
  const html = await fetchPostHtml("L_TITLE", query);
  if (!html) return [];

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const books: Book[] = [];

  $("div.row").each((_, row) => {
    try {
      const linkEl = $(row).find("a.name.goDetail").first();
      const title = linkEl.text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const isbn = (linkEl.attr("isbn") ?? "").trim().split(" ")[0];
      if (!isbn) return;
      if (seen.has(isbn)) return;
      seen.add(isbn);

      const coverSrc = $(row).find("div.thumb img").first().attr("src");
      const authorText = findFieldText($, row, "저자")
  .replace(/[;,\s]+$/g, "")
  .trim();
      const pubRaw = findFieldText($, row, "출판정보");
      const { publisher, publishYear } = parsePublisherYear(pubRaw);

      books.push({
        isbn,
        title,
        author: authorText,
        publisher,
        publishYear,
        coverImage: coverSrc ? resolveUrl(coverSrc) : undefined,
      });
    } catch {
      // 개별 항목 파싱 실패 스킵
    }
  });

  return books;
}

/**
 * 특정 ISBN 소장 현황
 * 전략:
 * 1. vLoca 기반 상세 ajax URL 시도
 * 2. 실패 시 제목으로 재검색 후 해당 ISBN 행만 파싱
 */
export async function fetchPhysicalAvailability(
  isbn: string
): Promise<PhysicalLibrary[]> {
  // 먼저 ISBN으로 검색 시도
  let html = await fetchPostHtml("L_ISBN", isbn);

  // 결과가 없으면 ISBN을 그대로 서명 검색으로 재시도 (일부 시스템 동작 방식)
  if (!html || !html.includes("div class=\"row\"")) {
    html = null;
  }

  // html이 없으면 빈 배열 — availability API에서 title 기반으로 재시도
  if (!html) return [];

  return parsePhysicalRows(html, isbn);
}

/**
 * 제목으로 소장현황 파싱 (ISBN 검색 실패 시 fallback)
 */
export async function fetchPhysicalAvailabilityByTitle(
  title: string,
  isbn: string
): Promise<PhysicalLibrary[]> {
  const html = await fetchPostHtml("L_TITLE", title);
  if (!html) return [];
  return parsePhysicalRows(html, isbn);
}

/** div.row 에서 소장도서관 + 대출상태 파싱 */
function parsePhysicalRows(html: string, isbn: string): PhysicalLibrary[] {
  const $ = cheerio.load(html);
  const results: PhysicalLibrary[] = [];

  $("div.row").each((_, row) => {
    try {
      const linkEl = $(row).find("a.name.goDetail").first();
      const rowIsbn = (linkEl.attr("isbn") ?? "").trim().split(" ")[0];

      // ISBN이 반드시 일치해야 함 — 없거나 다르면 스킵
      if (!rowIsbn || rowIsbn !== isbn) return;

      const libraryName = findFieldText($, row, "소장도서관").trim();
      const callNumber = findFieldText($, row, "자료실명").trim();

      const statusTd = $(row).find("table.statusBox tbody td").eq(0);
      const returnTd = $(row).find("table.statusBox tbody td").eq(1);

      const statusText = statusTd.text().replace(/\s+/g, " ").trim();
      const returnDate = returnTd.text().replace(/\s+/g, " ").trim();

      const available = isAvailable(statusText);
      const masterLib = matchLibrary(libraryName);
      if (!masterLib) return;

      // 해당 도서관만 선택된 검색결과 URL
      const bookTitle = linkEl.text().replace(/\s+/g, " ").trim();
      const searchUrl =
        `${BASE_URL}/dj/intro/search/index.do` +
        `?menu_idx=111&booktype=BOOK` +
        `&libraryCodes=${encodeURIComponent(masterLib.id)}` +
        `&search_type=L_TITLE&search_text=${encodeURIComponent(bookTitle)}`;

      results.push({
        ...masterLib,
        available,
        callNumber,
        returnDueDate:
          available ? undefined : returnDate && returnDate !== "-" ? returnDate : undefined,
        searchResultUrl: searchUrl,
      });
    } catch {
      // 행 파싱 실패 스킵
    }
  });

  // 같은 도서관 ID가 여러 번 나오면 집계 (2권 이상 소장 시)
  const grouped = new Map<string, PhysicalLibrary & { totalCount: number; availableCount: number }>();
  for (const lib of results) {
    const existing = grouped.get(lib.id);
    if (existing) {
      existing.totalCount += 1;
      if (lib.available) existing.availableCount += 1;
      // 한 권이라도 대출가능이면 available = true
      if (lib.available) existing.available = true;
    } else {
      grouped.set(lib.id, {
        ...lib,
        totalCount: 1,
        availableCount: lib.available ? 1 : 0,
      });
    }
  }

  return Array.from(grouped.values()).map((lib) => ({
    ...lib,
    // 2권 이상일 때만 copyInfo 표시
    copyInfo: lib.totalCount > 1 ? `${lib.availableCount}/${lib.totalCount}` : undefined,
  }));
}

// ─── 내부 유틸 ────────────────────────────────────────────────

function findFieldText(
  $: ReturnType<typeof cheerio.load>,
  row: any,
  label: string
): string {
  let result = "";
  $(row)
    .find("p")
    .each((_, p) => {
      const fontText = $(p).find("font").first().text().trim();
      if (fontText.includes(label)) {
        result = $(p)
          .text()
          .replace(fontText, "")
          .replace(/^\s*:\s*/, "")
          .replace(/\s+/g, " ")
          .trim();
        return false;
      }
    });
  return result;
}

async function fetchPostHtml(
  searchType: string,
  searchText: string
): Promise<string | null> {
  if (!searchText) return null;
  const url = `${BASE_URL}/dj/intro/search/index.do`;
  const libCodes = ALL_LIBRARY_CODES.split(",");
  const params = new URLSearchParams();
  params.append("menu_idx", "111");
  params.append("booktype", "BOOK");
  params.append("search_type", searchType);
  params.append("search_text", searchText);
  params.append("viewPage", "1");
  params.append("rowCount", "100");
  params.append("allBookListStr", "");
  params.append("search_type2", searchType);
  params.append("search_library", "");
  params.append("search_form_code", "");
  params.append("search_kdc", "");
  params.append("search_year", "");
  params.append("search_athor", "");
  params.append("search_publisher", "");
  params.append("manageCode", "");
  libCodes.forEach((code) => {
    params.append("libraryCodes", code);
    params.append("_libraryCodes", "on");
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        Referer: `${BASE_URL}/dj/intro/search/index.do?menu_idx=111`,
        Origin: BASE_URL,
      },
      body: params.toString(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return decodeKorean(buffer);
  } catch {
    return null;
  }
}

function decodeKorean(buffer: ArrayBuffer): string {
  try {
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    if (!utf8.includes("\uFFFD")) return utf8;
  } catch {}
  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {}
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function parsePublisherYear(raw: string): {
  publisher: string;
  publishYear: number;
} {
  const yearMatch = raw.match(/(\d{4})/);
  const publishYear = yearMatch ? parseInt(yearMatch[1]) : 0;
  const publisher = raw.replace(/[,\s]*\d{4}.*$/, "").trim();
  return { publisher: publisher || raw, publishYear };
}

function isAvailable(statusText: string): boolean {
  if (["대출가능", "비치중", "재실"].some((s) => statusText.includes(s)))
    return true;
  return false;
}

function matchLibrary(
  libraryName: string
): (typeof DONGJAK_LIBRARIES)[number] | null {
  if (!libraryName) return null;
  // 띄어쓰기를 정규화(제거)해서 비교 — 도서관명은 고정이므로 전체 매칭만 허용
  const normalize = (s: string) => s.replace(/\s+/g, "");
  const normalizedInput = normalize(libraryName);
  return (
    DONGJAK_LIBRARIES.find(
      (l) => normalize(l.libraryName) === normalizedInput
    ) ?? null
  );
}

function resolveUrl(src: string): string {
  if (src.startsWith("http")) return src;
  return `${BASE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}
