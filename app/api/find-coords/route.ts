export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY!;

const libraries = [
  { id: "smart_sindaebang", name: "신대방삼거리역 3번출구", address: "서울 동작구 신대방삼거리역 3번출구" },
  { id: "smart_jangseungbaegi", name: "장승배기역 1번출구", address: "서울 동작구 장승배기역 1번출구" },
  { id: "smart_isu", name: "총신대입구이수역 13번출구", address: "서울 동작구 총신대입구역 13번출구" },
  { id: "smart_nodeul", name: "노들역 5번출구", address: "서울 동작구 노들역 5번출구" },
  { id: "smart_kkamangdol", name: "까망돌도서관", address: "서울특별시 동작구 서달로 129" },
  { id: "smart_gymnasium", name: "동작구민체육센터", address: "서울 동작구 동작구민체육센터" },
];

async function geocode(address: string) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });
  const data = await res.json();
  if (data.documents?.length > 0) {
    const p = data.documents[0];
    return { lat: parseFloat(p.y), lng: parseFloat(p.x) };
  }
  return null;
}

export async function GET() {
  console.log("KAKAO_REST_KEY:", process.env.KAKAO_REST_KEY ? "있음" : "없음");
  const results = [];
  for (const lib of libraries) {
    const result = await geocode(lib.address);
    results.push({
      id: lib.id,
      name: lib.name,
      address: lib.address,
      lat: result?.lat ?? 0,
      lng: result?.lng ?? 0,
      found: !!result,
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  return NextResponse.json(results);
}