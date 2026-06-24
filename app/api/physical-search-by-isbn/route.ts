import { NextRequest, NextResponse } from "next/server";
import { searchPhysicalBooksByIsbn } from "@/lib/scraper/seoulLibrary";
import { ApiResponse, PhysicalBook } from "@/types";

/**
 * [2026-06-24 신규] ISBN 기반 종이책 검색 API.
 *
 * 기존 /api/physical-search(제목 기반)와 책임을 분리 — 그 라우트는
 * 그대로 두고, 새 흐름(카카오로 ISBN 후보 확정 → 그 ISBN으로 25개 구
 * 검색)에는 이 라우트를 사용. isbn과 title을 함께 받는 이유는, title이
 * 마포구 전용 fallback(ISBN 검색 실패 시 제목 검색 재시도)에 필요하기
 * 때문 — searchPhysicalBooksByIsbn 내부에서 마포구에만 사용됨.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const title = searchParams.get("title")?.trim();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (!isbn) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "ISBN이 필요합니다." },
      { status: 400 }
    );
  }

  if (!title) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "제목이 필요합니다." },
      { status: 400 }
    );
  }

  const lat = latParam ? parseFloat(latParam) : undefined;
  const lng = lngParam ? parseFloat(lngParam) : undefined;

  try {
    const books = await searchPhysicalBooksByIsbn(isbn, title, lat, lng);
    return NextResponse.json<ApiResponse<PhysicalBook[]>>({
      success: true,
      data: books,
    });
  } catch (e) {
    console.error("[/api/physical-search-by-isbn] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}