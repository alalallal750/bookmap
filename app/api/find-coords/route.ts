import { NextResponse } from "next/server";

const KAKAO_REST_KEY = "a85e74481662abf212ff7a17a40b12e4";

const libraries = [
  { id: "lib_NA", name: "노량진1동 작은도서관" },
  { id: "lib_NB", name: "노량진2동 작은도서관" },
  { id: "lib_NN", name: "대방동 작은도서관" },
  { id: "lib_NH", name: "사당1동 작은도서관" },
  { id: "lib_NJ", name: "사당2동 작은도서관" },
  { id: "lib_NK", name: "사당3동 작은도서관" },
  { id: "lib_NM", name: "사당5동 작은도서관" },
  { id: "lib_NC", name: "상도1동 작은도서관" },
  { id: "lib_ND", name: "상도2동 작은도서관" },
  { id: "lib_NE", name: "상도3동 작은도서관" },
  { id: "lib_NF", name: "상도4동 작은도서관" },
  { id: "lib_NP", name: "신대방1동 작은도서관" },
  { id: "lib_NQ", name: "신대방2동 작은도서관" },
  { id: "lib_NG", name: "흑석동 작은도서관" },
  { id: "lib_MH", name: "다울작은도서관" },
  { id: "lib_MJ", name: "국사봉숲속작은도서관" },
  { id: "lib_MP", name: "신대방햇살작은도서관" },
  { id: "lib_PA", name: "꿈담도서관" },
  { id: "lib_PB1", name: "꿈익는책마을" },
  { id: "lib_PC1", name: "나무별작은도서관" },
  { id: "lib_PG", name: "담소작은도서관" },
  { id: "lib_NR", name: "만나작은도서관" },
  { id: "lib_PB2", name: "보라매e편한세상작은도서관" },
  { id: "lib_PC2", name: "비전어린이도서관" },
  { id: "lib_PD", name: "상도sh-ville작은도서관" },
  { id: "lib_PE1", name: "상도더샵아파트작은도서관" },
  { id: "lib_PE", name: "상도중앙작은도서관" },
  { id: "lib_PF1", name: "새빛작은도서관" },
  { id: "lib_PF2", name: "생명나무도서관" },
  { id: "lib_PC", name: "성대골어린이도서관" },
  { id: "lib_PH", name: "아트앤힐링작은도서관" },
  { id: "lib_PH2", name: "애스톤파크작은도서관" },
  { id: "lib_PJ", name: "양문작은도서관" },
  { id: "lib_PK", name: "열림카페속작은도서관" },
  { id: "lib_PL", name: "오손도손우리동네작은도서관" },
  { id: "lib_PM", name: "작은도서관민주주의" },
  { id: "lib_PN", name: "주님의숲작은도서관" },
  { id: "lib_PO", name: "지혜고" },
  { id: "lib_PF", name: "지혜샘터작은도서관" },
  { id: "lib_PP", name: "트윈파크작은도서관" },
  { id: "lib_PQ", name: "푸른도서관" },
  { id: "lib_PR", name: "한숲고" },
  { id: "lib_PB", name: "행복한래미안작은도서관" },
  { id: "lib_PS", name: "헤브론문고" },
];

async function searchPlace(name: string) {
  const query = `서울 동작구 ${name}`;
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });
  const data = await res.json();
  if (data.documents?.length > 0) {
    const p = data.documents[0];
    return {
      address: p.road_address_name || p.address_name,
      lat: parseFloat(p.y),
      lng: parseFloat(p.x),
    };
  }
  return null;
}

export async function GET() {
  const results = [];
  for (const lib of libraries) {
    const result = await searchPlace(lib.name);
    results.push({
      id: lib.id,
      name: lib.name,
      address: result?.address ?? "검색실패",
      lat: result?.lat ?? 0,
      lng: result?.lng ?? 0,
      found: !!result,
    });
    await new Promise((r) => setTimeout(r, 150));
  }
  return NextResponse.json(results);
}