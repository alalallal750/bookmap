import { NextRequest, NextResponse } from "next/server";
import { searchEbooks } from "@/lib/scraper/seoulLibrary";
import { ApiResponse, EbookSearchResult, SearchCategory } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const categoryParam = searchParams.get("category");

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

  const category: SearchCategory = categoryParam === "author" ? "author" : "title";

  try {
    const books = await searchEbooks(query, category);

    return NextResponse.json<ApiResponse<EbookSearchResult>>({
      success: true,
      data: { books, total: books.length },
    });
  } catch (e) {
    console.error("[/api/ebook-search] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "전자도서관 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}
