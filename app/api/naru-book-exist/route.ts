import { NextRequest } from "next/server";
import { fetchBookExist } from "@/lib/api/data4library";

/**
 * [2026-07-18 신규 — 전국판] 도서관 1곳의 소장·대출가능 여부 온디맨드 조회.
 *
 * 전국판 호출 절약 원칙: bookExist는 선행 일괄 호출하지 않고, 사용자가
 * 마커를 탭해 상세패널을 열 때 이 라우트로 그 도서관 1건만 조회한다.
 * fetchBookExist에 fetch 캐시(revalidate 6시간)가 걸려 있어 같은
 * 책+도서관 재조회는 한도를 소비하지 않음 (bookExist는 전일 기준이라
 * 하루 안의 캐시는 무손실).
 *
 * 실패(한도 초과·네트워크) 시 known=false — 클라이언트는 "소장" 표시를
 * 유지하면 됨 (악화 없음).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const libCode = searchParams.get("libCode")?.trim();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  if (!isbn || !/^\d{10,13}$/.test(isbn)) {
    return json({ success: false, error: "유효한 ISBN이 필요합니다." }, 400);
  }
  if (!libCode || !/^\d{1,12}$/.test(libCode)) {
    return json({ success: false, error: "유효한 libCode가 필요합니다." }, 400);
  }

  try {
    const result = await fetchBookExist(libCode, isbn);
    if (result === null) {
      return json({ success: true, known: false });
    }
    return json({
      success: true,
      known: true,
      hasBook: result.hasBook,
      loanAvailable: result.loanAvailable,
    });
  } catch (e) {
    console.error("[/api/naru-book-exist] error:", e);
    return json({ success: false, error: "대출가능 조회 중 오류가 발생했습니다." }, 500);
  }
}
