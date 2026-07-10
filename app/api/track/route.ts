import { NextRequest, NextResponse } from "next/server";

/**
 * [2026-07-09 신규] 상세 패널 버튼 클릭 계측 — Vercel 로그로만 남김
 * (별도 저장소 없음). "1권 남음/권수 미상에서 확인 버튼을 실제로 얼마나
 * 누르는가"가 후속 개선(앱 내 권수 표시 등) 판단 근거가 됨 (2026-07-09
 * 논의). 로그 검색 키워드: [track]
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    console.log("[track]", body.slice(0, 500));
  } catch {
    /* 계측은 실패해도 무시 */
  }
  return NextResponse.json({ ok: true });
}
