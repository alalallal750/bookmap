import { NextRequest } from "next/server";
import { searchPhysicalBooks } from "@/lib/scraper/seoulLibrary";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (!query) {
    return new Response(
      JSON.stringify({ type: "done", success: false, error: "검색어가 필요합니다." }) + "\n",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const lat = latParam ? parseFloat(latParam) : undefined;
  const lng = lngParam ? parseFloat(lngParam) : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };
      try {
        const result = await searchPhysicalBooks(query, lat, lng, (gu) => {
          send({ type: "progress", gu });
        });
        send({ type: "done", success: true, data: result });
      } catch (e) {
        console.error("[/api/physical-search] error:", e);
        send({ type: "done", success: false, error: "검색 중 오류가 발생했습니다." });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
