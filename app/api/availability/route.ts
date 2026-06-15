import { NextRequest, NextResponse } from "next/server";
import {
  fetchPhysicalAvailability,
  fetchPhysicalAvailabilityByTitle,
  searchBooks,
} from "@/lib/scraper/dongjak";
import {
  fetchSmartLibraryAvailability,
  extractSmartLibraries,
} from "@/lib/scraper/smartLibrary";
import { fetchDongjakEduAvailability, fetchDongjakEduSmartAvailability } from "@/lib/scraper/dongjak_edu";
import { Availability, ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const title = searchParams.get("title")?.trim();

  if (!isbn) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "ISBN이 필요합니다." },
      { status: 400 }
    );
  }

  try {
    // 1. 통합도서관 + 교육청 동시 검색
    const [allPhysical, eduLibrary, eduSmartLibrary] = await Promise.all([
      fetchPhysicalAvailability(isbn),
      fetchDongjakEduAvailability(isbn),
      fetchDongjakEduSmartAvailability(isbn),
    ]);

    // 2. 통합도서관 결과에서 스마트도서관 분리
    let { physical, smartLibrary: smartFromPhysical } = extractSmartLibraries(
      allPhysical.length > 0 ? allPhysical : await (async () => {
        let bookTitle = title;
        if (!bookTitle) {
          const books = await searchBooks(isbn);
          bookTitle = books[0]?.title;
        }
        return bookTitle ? fetchPhysicalAvailabilityByTitle(bookTitle, isbn) : [];
      })()
    );

    // 3. 스마트도서관 별도 검색 (title 기반) — 통합도서관과 동시 실행 불가 (title 의존)
    let smartLibrary = smartFromPhysical;
    if (title) {
      const smartResults = await fetchSmartLibraryAvailability(title.slice(0, 10));
      const existingIds = new Set(smartFromPhysical.map((l) => l.id));
      const newSmart = smartResults.filter((l) => !existingIds.has(l.id));
      smartLibrary = [...smartFromPhysical, ...newSmart];
    }

    const availability: Availability = {
      isbn,
      ebook: [],
      audiobook: [],
      physical: [...physical, ...eduLibrary],
      smartLibrary: [...smartLibrary, ...eduSmartLibrary],
    };

    return NextResponse.json<ApiResponse<Availability>>({
      success: true,
      data: availability,
    });
  } catch (e) {
    console.error("[/api/availability] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "소장정보를 불러오는 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}
