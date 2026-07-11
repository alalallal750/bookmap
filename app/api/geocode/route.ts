import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";

/**
 * [2026-07-12 신규] 장소 이름("이수역", "서울숲")을 좌표로 변환하는 API.
 * MCP 서버(caniread-mcp)가 "OO역 근처" 같은 위치 기반 검색을 처리할 때
 * 호출한다. 클라이언트에서 KAKAO_REST_KEY를 직접 쓰면 키가 노출되므로
 * book-candidates와 마찬가지로 반드시 이 서버 라우트를 거친다.
 *
 * 카카오 로컬 키워드 검색을 먼저 시도하고(역/건물/장소명 커버),
 * 0건이면 주소 검색으로 fallback(도로명/지번 주소 입력 커버).
 * 서비스가 서울 한정이므로 키워드 검색은 서울 근방 사각형(rect)으로 제한.
 */

export type GeocodeData = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
};

// 서울 대략 경계 (lng1,lat1,lng2,lat2) — 키워드 검색 결과를 서울 근방으로 제한
const SEOUL_RECT = "126.734,37.413,127.269,37.715";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "장소 이름이 필요합니다." },
      { status: 400 }
    );
  }

  const restApiKey = process.env.KAKAO_REST_KEY;
  if (!restApiKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "지오코딩 설정이 되어 있지 않습니다." },
      { status: 500 }
    );
  }

  const headers = { Authorization: `KakaoAK ${restApiKey}` };

  try {
    const keywordUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?size=1&rect=${SEOUL_RECT}&query=${encodeURIComponent(query)}`;
    const keywordRes = await fetch(keywordUrl, { headers });
    if (keywordRes.ok) {
      const json = await keywordRes.json();
      const doc = json.documents?.[0];
      if (doc) {
        return NextResponse.json<ApiResponse<GeocodeData>>({
          success: true,
          data: {
            name: doc.place_name ?? query,
            lat: parseFloat(doc.y),
            lng: parseFloat(doc.x),
            address: doc.road_address_name || doc.address_name || undefined,
          },
        });
      }
    }

    const addressUrl = `https://dapi.kakao.com/v2/local/search/address.json?size=1&query=${encodeURIComponent(query)}`;
    const addressRes = await fetch(addressUrl, { headers });
    if (addressRes.ok) {
      const json = await addressRes.json();
      const doc = json.documents?.[0];
      if (doc) {
        return NextResponse.json<ApiResponse<GeocodeData>>({
          success: true,
          data: {
            name: doc.address_name ?? query,
            lat: parseFloat(doc.y),
            lng: parseFloat(doc.x),
            address: doc.address_name || undefined,
          },
        });
      }
    }

    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `"${query}" 위치를 서울 안에서 찾지 못했습니다.` },
      { status: 404 }
    );
  } catch (e) {
    console.error("[/api/geocode] error:", e);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "위치 검색 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}
