/**
 * 동작구 스마트도서관 파서
 * URL: http://smartlib.dongjak.go.kr:8088/EZ-950SL_Web/mainPage/SI_searchbookindex_Service.jsp
 *
 * 스마트도서관 6개:
 * - 장승배기역 (no=1)
 * - 신대방삼거리역 (no=2)
 * - 총신대입구(이수역) (no=3)
 * - 노들역 (no=4)
 * - 까망돌스마트 (no=5)
 * - 동작구민체육센터 (no=6)
 */

import * as cheerio from "cheerio";
import { PhysicalLibrary } from "@/types";
import iconv from "iconv-lite";

const SMART_BASE_URL =
  "http://smartlib.dongjak.go.kr:8088/EZ-950SL_Web/mainPage/SI_searchbookindex_Service.jsp";

// 스마트도서관 마스터 데이터
export const SMART_LIBRARIES: Omit<
  PhysicalLibrary,
  "available" | "callNumber" | "returnDueDate" | "distance" | "searchResultUrl" | "copyInfo" | "totalCount" | "availableCount"
>[] = [
  {
    id: "smart_jangseungbaegi",
    libraryName: "스마트도서관 장승배기역",
    libraryType: "smart_library",
    address: "서울특별시 동작구 장승배기역 내",
    latitude: 37.5004,
    longitude: 126.9399,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
  {
    id: "smart_sindaebang",
    libraryName: "스마트도서관 신대방삼거리역",
    libraryType: "smart_library",
    address: "서울특별시 동작구 신대방삼거리역 내",
    latitude: 37.4978,
    longitude: 126.9128,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
  {
    id: "smart_isu",
    libraryName: "스마트도서관 총신대입구(이수역)",
    libraryType: "smart_library",
    address: "서울특별시 동작구 이수역 내",
    latitude: 37.4854,
    longitude: 126.9823,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
  {
    id: "smart_nodeul",
    libraryName: "스마트도서관 노들역",
    libraryType: "smart_library",
    address: "서울특별시 동작구 노들역 내",
    latitude: 37.5165,
    longitude: 126.9389,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
  {
    id: "smart_kkamangdol",
    libraryName: "스마트도서관 까망돌스마트",
    libraryType: "smart_library",
    address: "서울특별시 동작구 보라매로5길 15 까망돌도서관 내",
    latitude: 37.4923,
    longitude: 126.9255,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
  {
    id: "smart_gymnasium",
    libraryName: "스마트도서관 동작구민체육센터",
    libraryType: "smart_library",
    address: "서울특별시 동작구 동작구민체육센터 내",
    latitude: 37.4997,
    longitude: 126.9321,
    openingHours: "연중무휴 05:30~24:00",
    homepageUrl: SMART_BASE_URL,
  },
];

// 장비번호 매핑 (드롭다운 순서 기반 — 실제 값은 테스트 후 수정 필요)
const SMART_LIB_NO: Record<string, string> = {
  smart_jangseungbaegi: "3",
  smart_sindaebang: "1",
  smart_isu: "2",
  smart_nodeul: "4",
  smart_kkamangdol: "5",
  smart_gymnasium: "6",
};

/**
 * 모든 스마트도서관에서 특정 제목 검색
 * 병렬 요청 후 소장하는 곳만 반환
 */
export async function fetchSmartLibraryAvailability(
  title: string
): Promise<PhysicalLibrary[]> {
  const results = await Promise.allSettled(
    SMART_LIBRARIES.map((lib) => fetchOneSmartLib(lib, title))
  );

  return results
    .flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

async function fetchOneSmartLib(
  lib: typeof SMART_LIBRARIES[number],
  title: string
): Promise<PhysicalLibrary | null> {
  const no = SMART_LIB_NO[lib.id];
  if (!no) return null;

  try {

// 한글을 EUC-KR 바이너리로 변환
const wordEncoded = iconv.encode(title, "euc-kr");
const wordHex = Array.from(wordEncoded)
  .map((b) => "%" + b.toString(16).toUpperCase())
  .join("");

// 현재 시각을 HHMM 형식으로
const now = new Date();
const currentTime = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");

const body = `isbn=&PageNum=1&no=${no}&currentTime=${currentTime}&startTime=0520&endTime=2410&item=2&word=${wordHex}&sort=1`;

const res = await fetch(SMART_BASE_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html,application/xhtml+xml",
    Referer: SMART_BASE_URL,
  },
  body: body,
  signal: AbortSignal.timeout(8000),
});
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    // EUC-KR 인코딩 처리
    let html: string;
    try {
      html = new TextDecoder("euc-kr").decode(buffer);
    } catch {
      html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }

    const $ = cheerio.load(html);
    console.log("HTML 전체길이:", html.length);
console.log("HTML 뒷부분:", html.slice(-3000));

    // 검색결과 테이블 행 파싱
    let found = false;
    let available = false;
    let returnDueDate: string | undefined;

    // 테이블에서 제목 매칭 행 찾기
    $("table tbody tr").each((_, row) => {
      const titleCell = $(row).find("td").eq(1).text().trim();
      if (!titleCell) return;

      // 제목 부분 매칭 (앞 10글자 이상 일치)
      const searchTitle = title.slice(0, 10);
      if (!titleCell.includes(searchTitle)) return;

      found = true;
      console.log("found:", found, "available:", available, "title매칭:", titleCell);
      const statusText = $(row).find("td").eq(4).text().trim();
      console.log("statusText:", JSON.stringify(statusText));
      available = statusText.includes("대출가능");
      if (!available) {
        returnDueDate = $(row).find("td").eq(5).text().trim() || undefined;
      }
      return false; // 첫 번째 매칭 행만
    });

    console.log("최종:", lib.id, "found:", found, "available:", available);
    if (!found) return null;

    return {
      ...lib,
      available,
      returnDueDate,
      totalCount: 1,
      availableCount: available ? 1 : 0,
      searchResultUrl: `${SMART_BASE_URL}?no=${no}&item=2&word=${encodeURIComponent(title)}&sort=1&PageNum=1`,
    };
  } catch {
    return null;
  }
}

/**
 * extractSmartLibraries — physical 결과에서 스마트도서관 분리
 * (통합도서관 파싱 결과에 스마트도서관이 섞여있는 경우 분리용)
 */
export function extractSmartLibraries(
  physicalResults: PhysicalLibrary[]
): { physical: PhysicalLibrary[]; smartLibrary: PhysicalLibrary[] } {
  const smartIds = new Set(SMART_LIBRARIES.map((l) => l.id));
  return {
    physical: physicalResults.filter((l) => !smartIds.has(l.id)),
    smartLibrary: physicalResults.filter((l) => smartIds.has(l.id)),
  };
}
