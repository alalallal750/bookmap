export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY!;

const libraries = [
  { id: "lib_MK", name: "김영삼도서관", address: "서울특별시 동작구 매봉로 1" },
  { id: "lib_ML", name: "까망돌도서관", address: "서울특별시 동작구 서달로 129" },
  { id: "lib_MA", name: "사당솔밭도서관", address: "서울특별시 동작구 솔밭로 86" },
  { id: "lib_MN", name: "신대방누리도서관", address: "서울특별시 동작구 신대방1다길 19" },
  { id: "lib_MC", name: "동작영어마루도서관", address: "서울특별시 동작구 장승배기로16길 98" },
  { id: "lib_MF", name: "약수도서관", address: "서울특별시 동작구 양녕로22바길 64" },
  { id: "lib_ME", name: "동작샘터도서관", address: "서울특별시 동작구 동작대로29길 63-26" },
  { id: "lib_MD", name: "대방어린이도서관", address: "서울특별시 동작구 대방동길 55" },
  { id: "lib_MH", name: "다울작은도서관", address: "서울특별시 동작구 사당로20길 132" },
  { id: "lib_MJ", name: "국사봉숲속작은도서관", address: "서울특별시 동작구 양녕로23길 27" },
  { id: "lib_NA", name: "노량진1동 작은도서관", address: "서울 동작구 노량진로 190" },
  { id: "lib_NB", name: "노량진2동 작은도서관", address: "서울 동작구 장승배기로19길 48" },
  { id: "lib_NN", name: "대방동 작은도서관", address: "서울 동작구 여의대방로44길 20" },
  { id: "lib_NH", name: "사당1동 작은도서관", address: "서울 동작구 동작대로17길 28" },
  { id: "lib_NJ", name: "사당2동 작은도서관", address: "서울 동작구 동작대로29길 52" },
  { id: "lib_NK", name: "사당3동 작은도서관", address: "서울 동작구 사당로17길 86" },
  { id: "lib_NM", name: "사당5동 작은도서관", address: "서울 동작구 사당로2가길 219" },
  { id: "lib_NC", name: "상도1동 작은도서관", address: "서울 동작구 상도로55길 9" },
  { id: "lib_ND", name: "상도2동 작은도서관", address: "서울 동작구 상도로 211" },
  { id: "lib_NE", name: "상도3동 작은도서관", address: "서울 동작구 성대로2길 11" },
  { id: "lib_NF", name: "상도4동 작은도서관", address: "서울 동작구 양녕로27길 44" },
  { id: "lib_NQ", name: "신대방2동 작은도서관", address: "서울 동작구 여의대방로24길 76" },
  { id: "lib_NG", name: "흑석동 작은도서관", address: "서울 동작구 흑석한강로 11" },
  { id: "lib_PG", name: "담소작은도서관", address: "서울 동작구 강남초등길 24" },
  { id: "lib_PE", name: "상도중앙작은도서관", address: "서울 동작구 상도로15길 47" },
  { id: "lib_PC", name: "성대골어린이도서관", address: "서울 동작구 성대로10길 23" },
  { id: "lib_PH", name: "아트&힐링작은도서관", address: "서울 동작구 상도로62길 13" },
  { id: "lib_PF", name: "지혜샘터작은도서관", address: "서울 동작구 성대로10가길 5" },
  { id: "lib_PB", name: "행복한래미안작은도서관", address: "서울 동작구 상도로53길 8" },
  { id: "lib_PJ", name: "양문작은도서관", address: "서울 동작구 시흥대로 646" },
  { id: "lib_NR", name: "만나작은도서관", address: "서울 동작구 사당로2다길 85" },
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