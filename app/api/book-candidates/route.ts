import { NextRequest, NextResponse } from "next/server";
import { searchKakaoBookCandidates } from "@/lib/api/kakaoBook";
import { ApiResponse, KakaoBookCandidate } from "@/types";

/**
 * [2026-06-24 신규] 책 제목으로 카카오 책 검색 API를 호출해 ISBN 후보
 * 목록을 반환하는 API. 클라이언트에서 KAKAO_REST_KEY를 직접 쓰면
 * 브라우저에 키가 노출되므로, 반드시 서버(이 라우트)를 거쳐 호출함.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "검색어가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const candidates = await searchKakaoBookCandidates(query);
    return NextResponse.json<ApiResponse<KakaoBookCandidate[]>>({
      success: true,
      data: candidates,
    });
  } catch (e) {
    console.error("[/api/book-candidates] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "도서 후보를 불러오는 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}