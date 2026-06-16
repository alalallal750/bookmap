import { NextRequest, NextResponse } from "next/server";
import { searchBooks } from "@/lib/scraper/dongjak";
import { searchDongjakEduBooks } from "@/lib/scraper/dongjak_edu";
import { ApiResponse, SearchResult } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 1) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색어를 입력해 주세요." },
      { status: 400 }
    );
  }

  if (query.length > 100) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색어가 너무 깁니다." },
      { status: 400 }
    );
  }

  try {
    // 두 서버에 동시에 검색 요청
    const [dongjak, edu] = await Promise.allSettled([
      searchBooks(query),
      searchDongjakEduBooks(query),
    ]);

    const dongjak_books = dongjak.status === "fulfilled" ? dongjak.value : [];
    const edu_books = edu.status === "fulfilled" ? edu.value : [];

    // ISBN 기준 중복 제거 (동작구 통합도서관 우선)
    const seen = new Set<string>(dongjak_books.map((b) => b.isbn));
    const merged = [
      ...dongjak_books,
      ...edu_books.filter((b) => !seen.has(b.isbn)),
    ].sort((a, b) => (b.publishYear ?? 0) - (a.publishYear ?? 0));

    return NextResponse.json<ApiResponse<SearchResult>>({
      success: true,
      data: { books: merged, total: merged.length },
    });
  } catch (e) {
    console.error("[/api/search] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "도서관 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}