import { NextRequest, NextResponse } from "next/server";
import { searchBooks } from "@/lib/scraper/dongjak";
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
    const books = await searchBooks(query);
    return NextResponse.json<ApiResponse<SearchResult>>({
      success: true,
      data: { books, total: books.length },
    });
  } catch (e) {
    console.error("[/api/search] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "도서관 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}
