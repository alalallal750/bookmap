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
import { fetchDongjakEduAvailability } from "@/lib/scraper/dongjak_edu";
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
    // 1. 통합도서관 소장현황 (ISBN → 제목 fallback)
    let allPhysical = await fetchPhysicalAvailability(isbn);
    if (allPhysical.length === 0) {
      let bookTitle = title;
      if (!bookTitle) {
        const books = await searchBooks(isbn);
        bookTitle = books[0]?.title;
      }
      if (bookTitle) {
        allPhysical = await fetchPhysicalAvailabilityByTitle(bookTitle, isbn);
      }
    }

    // 2. 통합도서관 결과에서 스마트도서관 분리
    const { physical, smartLibrary: smartFromPhysical } = extractSmartLibraries(allPhysical);

    // 3. 스마트도서관 별도 검색 (title 기반)
    let smartLibrary = smartFromPhysical;
    if (title) {
      const smartResults = await fetchSmartLibraryAvailability(title.slice(0, 10));
      // 통합도서관에서 이미 나온 것과 합치되 중복 제거
      const existingIds = new Set(smartFromPhysical.map((l) => l.id));
      const newSmart = smartResults.filter((l) => !existingIds.has(l.id));
      smartLibrary = [...smartFromPhysical, ...newSmart];
    }

    // 4. 동작도서관(교육청) 별도 검색
    const eduLibrary = await fetchDongjakEduAvailability(isbn);

    const availability: Availability = {
      isbn,
      ebook: [],
      audiobook: [],
      physical: [...physical, ...eduLibrary],
      smartLibrary,
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
