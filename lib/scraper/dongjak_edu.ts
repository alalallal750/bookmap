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
    `&mainSearchType=on&rowCount=100&search_text=${encodeURIComponent(isbn)}`;

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

  

  $("div.cont[data-tab='tab1'] dl.bookDataWrap").each((_, el) => {
    const rowIsbn = $(el).find("dt a[isbn]").attr("isbn") ?? "";
    if (rowIsbn !== isbn) return;

    totalCount++;

    const site = $(el).find("dd.site span").last().text().replace("자료실 :", "").replace(/\s+/g, " ").trim();
    if (site && !callNumber) callNumber = site;

    const stateBar = $(el).next("div.bookStateBar");
    const isAvailable = stateBar.find("a.reserve-btn").text().replace(/\s+/g, "").includes("도서대출가능");
    if (isAvailable) {
      availableCount++;
    }
  });

  if (totalCount === 0) return [];

  return [{
    id: "lib_EDU",
    libraryName: "동작도서관",
    libraryType: "edu_library",
    address: "서울시 동작구 장승배기로 94",
    latitude: 37.5034,
    longitude: 126.9393,
    homepageUrl: BASE_URL,
    searchResultUrl: url,
    available: availableCount > 0,
    callNumber: callNumber || "동작종합자료실",
    availableCount,
    totalCount,
    copyInfo: totalCount > 1 ? `${availableCount}/${totalCount}` : undefined,
 }];
}

export async function fetchDongjakEduSmartAvailability(
  isbn: string
): Promise<PhysicalLibrary[]> {
  const url =
    `${BASE_URL}/djlib/module/unmannedReservation/search.do` +
    `?menu_idx=130&locExquery=111013&editMode=normal` +
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

  $("dl.bookDataWrap").each((_, el) => {
    const rowIsbn = $(el).find("dt a[isbn]").attr("isbn") ?? "";
    if (rowIsbn !== isbn) return;

    totalCount++;

    const stateBar = $(el).next("div.bookStateBar");
    const isAvailable = stateBar.find("a.reserve-btn").text().replace(/\s+/g, "").includes("도서대출가능");
    if (isAvailable) {
      availableCount++;
    }
  });

  if (totalCount === 0) return [];

  return [{
    id: "smart_EDU",
    libraryName: "동작도서관 스마트도서관",
    libraryType: "smart_library",
    address: "서울시 동작구 장승배기로 94 (동작도서관 정문 왼쪽)",
    latitude: 37.5035,
    longitude: 126.9390,
    homepageUrl: BASE_URL,
    searchResultUrl: url,
    available: availableCount > 0,
    callNumber: "스마트도서관",
    availableCount,
    totalCount,
    copyInfo: totalCount > 1 ? `${availableCount}/${totalCount}` : undefined,
  }];
}
