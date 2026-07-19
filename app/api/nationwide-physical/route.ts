import { NextRequest } from "next/server";
import { fetchHoldingLibCodesByRegion } from "@/lib/api/data4library";
import { getLibrariesByUnit } from "@/lib/data/nationwideLibraries";
import { getSearchUnit, getUnitsByRegion } from "@/lib/data/searchUnits";
import { buildNaruPortalSearchUrl } from "@/lib/data/naruPortalUrls";
import { buildNationwidePortalSearchUrl } from "@/lib/data/nationwidePortalUrls";
import type { LibraryType, PhysicalLibrary } from "@/types";

/**
 * [2026-07-18 신규 — 전국판] 시도 단위 종이책 소장 검색.
 *
 * 같은 날 시군구 단위 → 시도 단위로 전환 (사용자 결정, 인수인계 18장):
 *   - units(선택 시군구)로 요청받지만, 호출은 그 시군구들이 속한 "시도"
 *     단위 libSrchByBook 1~2회가 전부. 응답은 해당 시도 전체 소장관.
 *   - 시군구 구분·좌표는 로컬 정적 데이터로 처리 — 지도에서 인접
 *     시군구로 이동해도 재검색이 필요 없고, 같은 책+같은 시도는 시군구
 *     조합과 무관하게 6시간 캐시 1개를 공유.
 *   - units는 지도 시작 위치·라벨용 메타로만 쓰임.
 *
 * bookExist는 여기서 절대 호출하지 않음 — 마커 탭 시 /api/naru-book-exist
 * 로 그 도서관 1건만 온디맨드 조회 (호출 절약 원칙).
 *
 * 서울(region 11)도 처리 가능(경기 접경 사용자의 인접 검색용)하지만,
 * 순수 서울 사용자는 페이지 단에서 기존 /physical 파이프라인으로 보낸다.
 *
 * 한 시도의 조회 실패는 그 시도만 생략 (부분 실패 허용) —
 * meta.failedRegions로 알려줌.
 */

const MAX_UNITS = 5;
const MAX_REGIONS = 3;

function inferLibraryType(name: string): LibraryType {
  if (name.includes("스마트")) return "smart_library";
  if (name.includes("작은")) return "small_library";
  return "library";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim();
  const title = searchParams.get("title")?.trim() ?? "";
  const unitsParam = searchParams.get("units")?.trim();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  if (!isbn || !/^\d{10,13}$/.test(isbn)) {
    return json({ success: false, error: "유효한 ISBN이 필요합니다." }, 400);
  }

  const units = [
    ...new Set(
      (unitsParam ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter((u) => /^\d{5}$/.test(u) && getSearchUnit(u) !== undefined)
    ),
  ].slice(0, MAX_UNITS);
  if (units.length === 0) {
    return json({ success: false, error: "유효한 시군구 코드(units)가 필요합니다." }, 400);
  }

  const regions = [...new Set(units.map((u) => u.slice(0, 2)))].slice(0, MAX_REGIONS);

  try {
    const results = await Promise.all(
      regions.map(async (region) => ({
        region,
        holding: await fetchHoldingLibCodesByRegion(isbn, region),
      }))
    );

    const libraries: PhysicalLibrary[] = [];
    const failedRegions: { region: string; province: string }[] = [];
    const regionSummaries: { region: string; province: string; holdingCount: number }[] = [];

    for (const { region, holding } of results) {
      const regionUnits = getUnitsByRegion(region);
      const province = regionUnits[0]?.province ?? region;
      if (holding === null) {
        failedRegions.push({ region, province });
        continue;
      }
      let count = 0;
      for (const unit of regionUnits) {
        const holders = getLibrariesByUnit(unit.code).filter((l) => holding.has(l.libCode));
        count += holders.length;
        for (const src of holders) {
          libraries.push({
            id: `naru_${src.libCode}`,
            libraryName: src.libName,
            libraryType: inferLibraryType(src.libName),
            address: src.address ?? "",
            latitude: src.latitude,
            longitude: src.longitude,
            tel: src.tel,
            // available/availableCount 없음 — 온디맨드 bookExist 전까지 미정.
            // 서울 구는 실측 검증된 포털 검색 URL 재사용, 비서울은 헤드리스
            // 검증 통과 도메인만 딥링크, 그 외는 홈페이지
            // (딥링크는 실측 검증 없이는 만들지 않음 — 13-3 교훈)
            searchResultUrl:
              (region === "11"
                ? buildNaruPortalSearchUrl(unit.district, isbn, title)
                : buildNationwidePortalSearchUrl(src.homepage, title)) ?? src.homepage,
            homepageUrl: src.homepage,
          });
        }
      }
      regionSummaries.push({ region, province, holdingCount: count });
    }

    const unitSummaries = units.map((code) => {
      const u = getSearchUnit(code)!;
      return { code, district: u.district };
    });

    return json({
      success: true,
      libraries,
      meta: { regions: regionSummaries, units: unitSummaries, failedRegions },
    });
  } catch (e) {
    console.error("[/api/nationwide-physical] error:", e);
    return json({ success: false, error: "전국 소장 검색 중 오류가 발생했습니다." }, 500);
  }
}
