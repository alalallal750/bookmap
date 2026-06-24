import { NextRequest, NextResponse } from "next/server";
import { searchPhysicalBooks } from "@/lib/scraper/seoulLibrary";
import { ApiResponse, PhysicalSearchResponse } from "@/types";

/**
 * [2026-06-24 변경] searchPhysicalBooks가 이제 { books, meta } 형태를
 * 반환 — meta에는 이번 검색이 위치 기준 좁은 범위였는지(scope: "nearby"),
 * 위치가 없어 25개 구 전체를 검색했는지(scope: "all") 정보가 담겨있음.
 * 화면이 이걸로 로딩 문구와 지도 화면의 재검색 버튼 노출 여부를 결정함.
 */
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
    const result = await searchPhysicalBooks(query, lat, lng);
    return NextResponse.json<ApiResponse<PhysicalSearchResponse>>({
      success: true,
      data: result,
    });
  } catch (e) {
    console.error("[/api/physical-search] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}