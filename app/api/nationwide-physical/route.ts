import { NextRequest } from "next/server";
import { fetchHoldingLibCodesByUnit } from "@/lib/api/data4library";
import { getLibrariesByUnit } from "@/lib/data/nationwideLibraries";
import { getSearchUnit } from "@/lib/data/searchUnits";
import { buildNaruPortalSearchUrl } from "@/lib/data/naruPortalUrls";
import type { LibraryType, PhysicalLibrary } from "@/types";

/**
 * [2026-07-18 신규 — 전국판] 시군구 단위 종이책 소장 검색.
 *
 * 전국판 호출 절약 원칙 (인수인계 17장 + 2026-07-18 사용자 결정):
 *   - 시군구당 libSrchByBook 1~2회가 선행 호출의 전부.
 *   - bookExist는 여기서 절대 호출하지 않음 — 마커 탭 시
 *     /api/naru-book-exist 로 그 도서관 1건만 온디맨드 조회.
 *   - 따라서 결과의 available/availableCount는 비어 있음 → 지도 마커는
 *     "소장"으로 표시하고, 상세패널이 열릴 때 가능/대출중으로 갱신.
 *
 * 시군구 코드는 searchUnits.ts의 잎 코드(부천 특례 포함)만 유효.
 * 서울(region 11) 단위도 받긴 하지만(경기 접경 사용자의 인접 검색용),
 * 순수 서울 사용자는 페이지 단에서 기존 /physical 파이프라인으로 보낸다
 * (기존 파이프라인 무수정 재사용 원칙).
 *
 * 한 시군구의 libSrchByBook 실패는 그 시군구만 생략 (부분 실패 허용) —
 * meta.failedUnits로 알려줌.
 */

const MAX_UNITS = 5;

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

  try {
    const results = await Promise.all(
      units.map(async (code) => ({
        code,
        holding: await fetchHoldingLibCodesByUnit(isbn, code),
      }))
    );

    const libraries: PhysicalLibrary[] = [];
    const failedUnits: string[] = [];
    const unitSummaries: { code: string; district: string; holdingCount: number }[] = [];

    for (const { code, holding } of results) {
      const unit = getSearchUnit(code)!;
      if (holding === null) {
        failedUnits.push(code);
        continue;
      }
      const holders = getLibrariesByUnit(code).filter((l) => holding.has(l.libCode));
      unitSummaries.push({ code, district: unit.district, holdingCount: holders.length });
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
          // 서울 구는 실측 검증된 포털 검색 URL 재사용, 그 외는 홈페이지
          // (딥링크는 실측 검증 없이는 만들지 않음 — 13-3 교훈)
          searchResultUrl:
            (unit.region === "11"
              ? buildNaruPortalSearchUrl(unit.district, isbn, title)
              : undefined) ?? src.homepage,
          homepageUrl: src.homepage,
        });
      }
    }

    return json({
      success: true,
      libraries,
      meta: { units: unitSummaries, failedUnits },
    });
  } catch (e) {
    console.error("[/api/nationwide-physical] error:", e);
    return json({ success: false, error: "전국 소장 검색 중 오류가 발생했습니다." }, 500);
  }
}
