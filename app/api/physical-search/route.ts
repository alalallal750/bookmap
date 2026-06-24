import { NextRequest, NextResponse } from "next/server";
import { searchPhysicalBooks } from "@/lib/scraper/seoulLibrary";
import { ApiResponse, PhysicalBook } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (!query) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색어가 필요합니다." },
      { status: 400 }
    );
  }

  const lat = latParam ? parseFloat(latParam) : undefined;
  const lng = lngParam ? parseFloat(lngParam) : undefined;

  try {
    const books = await searchPhysicalBooks(query, lat, lng);
    return NextResponse.json<ApiResponse<PhysicalBook[]>>({
      success: true,
      data: books,
    });
  } catch (e) {
    console.error("[/api/physical-search] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}