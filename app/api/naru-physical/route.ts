import { NextRequest } from "next/server";
import { fetchNaruPhysicalLibraries } from "@/lib/scraper/seoulLibrary";

/**
 * [2026-07-10 신규] 정보나루 단독 조회 — 지도 화면이 sessionStorage 캐시로
 * 진입했을 때(제목 검색 결과 재사용, ISBN API 호출 생략) 캐시에 빠져 있는
 * 구들만 가볍게 보강하기 위한 라우트.
 *
 * 대상 구는 클라이언트가 정한다:
 *   상시 정보나루 구(금천·송파·성북 — 제목 검색이 ISBN을 못 얻어 항상 비는 구)
 *   + 제목 검색에서 fetch 실패한 구(meta.failedGus — 노원·중구 타임아웃 등)
 *   - 캐시에 이미 결과가 있는 구(한 구의 결과는 한 소스 원칙)
 *
 * 스크래핑을 전혀 하지 않으므로 서울도서관 서버 부하와 무관. 정보나루
 * 호출은 서버 fetch 캐시(revalidate 6h)를 공유한다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const title = searchParams.get("title")?.trim() ?? "";
  const gusParam = searchParams.get("gus")?.trim();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  if (!isbn || !/^\d{10,13}$/.test(isbn)) {
    return json({ success: false, error: "유효한 ISBN이 필요합니다." }, 400);
  }
  const gus = [
    ...new Set(
      (gusParam ?? "")
        .split(",")
        .map((g) => g.trim())
        .filter((g) => /^[가-힣]{1,4}구$/.test(g))
    ),
  ];
  if (gus.length === 0) {
    return json({ success: true, libraries: [] });
  }

  try {
    const libraries = await fetchNaruPhysicalLibraries(gus, isbn, title);
    return json({ success: true, libraries });
  } catch (e) {
    console.error("[/api/naru-physical] error:", e);
    return json({ success: false, error: "정보나루 조회 중 오류가 발생했습니다." }, 500);
  }
}
