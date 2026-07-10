import { NextRequest } from "next/server";
import { searchPhysicalBooksByIsbn } from "@/lib/scraper/seoulLibrary";

/**
 * [2026-06-24 신규] ISBN 기반 종이책 검색 API.
 *
 * 기존 /api/physical-search(제목 기반)와 책임을 분리 — 그 라우트는
 * 그대로 두고, 새 흐름(카카오로 ISBN 후보 확정 → 그 ISBN으로 25개 구
 * 검색)에는 이 라우트를 사용. isbn과 title을 함께 받는 이유는, title이
 * 마포구 전용 fallback(ISBN 검색 실패 시 제목 검색 재시도)에 필요하기
 * 때문 — searchPhysicalBooksByIsbn 내부에서 마포구에만 사용됨.
 *
 * [2026-07-09 변경] 일반 JSON 응답 → NDJSON 스트리밍으로 전환 —
 * /api/physical-search(제목 검색)와 동일한 형식. 구별 결과가 도착할
 * 때마다 { type: "progress", gu }를 흘려보내 지도 화면이 "ㅇㅇ구 확인
 * 중" 진행 표시를 할 수 있게 함 (위치 없는 25개 구 전체 검색이 40초
 * 이상 걸려서 고정 문구만으론 멈춘 것처럼 보이는 문제).
 * 마지막 줄: { type: "done", success, data | error }.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const title = searchParams.get("title")?.trim();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  const badRequest = (error: string) =>
    new Response(JSON.stringify({ type: "done", success: false, error }) + "\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  if (!isbn) return badRequest("ISBN이 필요합니다.");
  if (!title) return badRequest("제목이 필요합니다.");

  const lat = latParam ? parseFloat(latParam) : undefined;
  const lng = lngParam ? parseFloat(lngParam) : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };
      try {
        const books = await searchPhysicalBooksByIsbn(isbn, title, lat, lng, (gu) => {
          send({ type: "progress", gu });
        });
        send({ type: "done", success: true, data: books });
      } catch (e) {
        console.error("[/api/physical-search-by-isbn] error:", e);
        send({ type: "done", success: false, error: "검색 중 오류가 발생했습니다." });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
