/**
 * 동작도서관 (djlib.sen.go.kr) HTML 파서
 * 서울시교육청 산하 동작구 단일 도서관
 *
 * 핵심 구조:
 *   dl.bookDataWrap 마다 도서 소장 1건
 *   - dt.tit2 a[isbn] → ISBN
 *   - div.bookStateBar 내부 태그로 대출상태 구분
 *     strong: 대출가능 / em: 예약가능 / span: 대출불가
 *   - dd.site → 자료실명
 */

import * as cheerio from "cheerio";
import { PhysicalLibrary } from "@/types";

const BASE_URL = "https://djlib.sen.go.kr";

export async function fetchDongjakEduAvailability(
  isbn: string
): Promise<PhysicalLibrary[]> {
  const url =
    `${BASE_URL}/djlib/intro/search/index.do` +
    `?menu_idx=4&locExquery=111013&editMode=normal` +
    `&officeNm=%EB%8F%99%EC%9E%91%EB%8F%84%EC%84%9C%EA%B4%80` +
    `&mainSearchType=on&search_text=${encodeURIComponent(isbn)}`;

  let html: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    html = await res.text();
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  let availableCount = 0;
  let totalCount = 0;
  let callNumber = "";

  $("dl.bookDataWrap").each((_, el) => {
    const rowIsbn = $(el).find("dt a[isbn]").attr("isbn") ?? "";
    if (rowIsbn !== isbn) return;

    totalCount++;

    const site = $(el).find("dd.site span").last().text().replace("자료실 :", "").trim();
    if (site && !callNumber) callNumber = site;

    const stateBar = $(el).find("div.bookStateBar");
    if (stateBar.find("strong").length > 0) {
      availableCount++;
    }
  });

  if (totalCount === 0) return [];

  return [{
    id: "lib_EDU",
    libraryName: "동작도서관",
    libraryType: "library",
    address: "서울시 동작구 장승배기로 94",
    latitude: 37.5109,
    longitude: 126.9326,
    homepageUrl: BASE_URL,
    searchResultUrl: url,
    available: availableCount > 0,
    callNumber: callNumber || "동작종합자료실",
    availableCount,
    totalCount,
    copyInfo: totalCount > 1 ? `${availableCount}/${totalCount}` : undefined,
  }];
}