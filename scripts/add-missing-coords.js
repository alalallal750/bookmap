/**
 * COORD-MISS 40개 도서관 좌표 수집 → branch-coords-v2.json에 추가
 *
 * 실행: node scripts/add-missing-coords.js
 *
 * survey-coord-miss.mjs 전수조사(2026-06-30) 결과에서
 * 파싱 오류(성동구 연도값, 중구 저자명, 노원구 분관명 합본 등) 제외 후
 * 진짜 DB 누락 도서관만 추린 목록.
 *
 * 카카오 로컬 검색 API로 좌표 수집 후:
 *   - matched  : 구 이름이 주소에 포함되어 신뢰 가능
 *   - mismatched: 구 이름이 주소에 없음 → 수동 확인 필요
 *   - notFound : 카카오 검색 자체에서 결과 없음
 *
 * 완료 후 data/branch-coords-v2.json의 matched 배열에 새 항목을 추가함
 * (기존 항목은 건드리지 않음).
 */

const fs = require("fs");
const path = require("path");

const KAKAO_REST_KEY = "a85e74481662abf212ff7a17a40b12e4";

// survey-coord-miss.mjs 전수조사 결과 기반 — 파싱 오류 제외한 진짜 MISS 목록
const MISSING_BRANCHES = [
  // ── 강남구 ──────────────────────────────────────────────────────
  { gu: "강남구", keyword: "논현문화마루 별관 도서관" },
  { gu: "강남구", keyword: "청담도서관 강남구" },

  // ── 관악구 ──────────────────────────────────────────────────────
  { gu: "관악구", keyword: "낙성대공원도서관" },

  // ── 광진구 ──────────────────────────────────────────────────────
  { gu: "광진구", keyword: "구의제3동도서관" },

  // ── 구로구 ──────────────────────────────────────────────────────
  { gu: "구로구", keyword: "NC신구로점스마트도서관" },
  { gu: "구로구", keyword: "개봉역스마트도서관" },
  { gu: "구로구", keyword: "구로천왕도서관" },
  { gu: "구로구", keyword: "구일역스마트도서관" },
  { gu: "구로구", keyword: "마중물도서관 구로구" },
  { gu: "구로구", keyword: "서서울생활과학고등학교도서관" },
  { gu: "구로구", keyword: "신도림고등학교도서관" },
  { gu: "구로구", keyword: "신도림어린이영어작은도서관" },
  { gu: "구로구", keyword: "신도림역스마트도서관" },
  { gu: "구로구", keyword: "오류동역스마트도서관" },
  { gu: "구로구", keyword: "온수역스마트도서관" },
  { gu: "구로구", keyword: "우신고등학교도서관" },
  { gu: "구로구", keyword: "천왕역스마트도서관" },
  { gu: "구로구", keyword: "흥부네그림책작은도서관" },

  // ── 도봉구 ──────────────────────────────────────────────────────
  { gu: "도봉구", keyword: "도서나눔이 도봉구" },
  { gu: "도봉구", keyword: "방학1동 작은도서관" },

  // ── 동대문구 ────────────────────────────────────────────────────
  { gu: "동대문구", keyword: "답십리1동아름드리작은도서관" },
  { gu: "동대문구", keyword: "답십리2동민들레작은도서관" },
  { gu: "동대문구", keyword: "이문1동꿈꾸는작은도서관" },
  { gu: "동대문구", keyword: "이문숲속어린이도서관" },
  { gu: "동대문구", keyword: "전농2동뜨락작은도서관" },
  { gu: "동대문구", keyword: "휘경1동새싹마루작은도서관" },
  { gu: "동대문구", keyword: "휘경2동꿈빛누리작은도서관" },

  // ── 동작구 ──────────────────────────────────────────────────────
  { gu: "동작구", keyword: "사당4동 작은도서관" },
  { gu: "동작구", keyword: "신대방1동 작은도서관" },
  { gu: "동작구", keyword: "아트앤힐링작은도서관" },

  // ── 양천구 ──────────────────────────────────────────────────────
  { gu: "양천구", keyword: "그린나래미술도서관" },
  { gu: "양천구", keyword: "목1동 도서방 양천구" },
  { gu: "양천구", keyword: "목마교육도서관 양천구" },
  { gu: "양천구", keyword: "미감도서관 양천구" },
  { gu: "양천구", keyword: "신월3동북카페 달빛마을책쉼터" },
  { gu: "양천구", keyword: "신정6동 도서방 양천구" },
  { gu: "양천구", keyword: "신정7동 도서방 양천구" },

  // ── 영등포구 ────────────────────────────────────────────────────
  { gu: "영등포구", keyword: "영등포동 작은도서관" },
  { gu: "영등포구", keyword: "영등포스마트도서관" },

  // ── 중랑구 ──────────────────────────────────────────────────────
  { gu: "중랑구", keyword: "면목3,8동작은도서관" },
];

async function searchKakao(keyword) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&size=1`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.documents?.[0] ?? null;
}

async function main() {
  const coordsPath = path.join(__dirname, "../data/branch-coords-v2.json");
  const existing = JSON.parse(fs.readFileSync(coordsPath, "utf8"));

  const newMatched = [];
  const newMismatched = [];
  const newNotFound = [];

  console.log(`총 ${MISSING_BRANCHES.length}개 도서관 좌표 수집 시작\n`);

  for (const { gu, keyword } of MISSING_BRANCHES) {
    try {
      const doc = await searchKakao(keyword);
      if (!doc) {
        console.log(`[NOT_FOUND] ${gu} | ${keyword}`);
        newNotFound.push({ gu, searchKeyword: keyword });
        continue;
      }

      const address = doc.road_address_name || doc.address_name || "";
      const matchedName = doc.place_name;
      const lat = doc.y;
      const lng = doc.x;

      if (!address.includes(gu)) {
        console.log(`[MISMATCH ] ${gu} | ${keyword} → ${matchedName} | 주소: ${address}`);
        newMismatched.push({ gu, searchKeyword: keyword, matchedName, address, lat, lng });
      } else {
        console.log(`[MATCHED  ] ${gu} | ${keyword} → ${matchedName}`);
        newMatched.push({
          gu,
          searchKeyword: keyword,
          matchedName,
          address,
          lat,
          lng,
        });
      }

      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.log(`[ERROR    ] ${gu} | ${keyword}: ${e.message}`);
      newNotFound.push({ gu, searchKeyword: keyword, error: e.message });
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`매칭: ${newMatched.length}개 / 불일치: ${newMismatched.length}개 / 미발견: ${newNotFound.length}개`);

  // branch-coords-v2.json에 추가 (기존 항목 유지)
  const updated = {
    matched: [...existing.matched, ...newMatched],
    mismatched: [...existing.mismatched, ...newMismatched],
    notFound: [...existing.notFound, ...newNotFound],
  };

  // BOM 없는 UTF-8로 저장
  const encoder = new TextEncoder();
  fs.writeFileSync(coordsPath, JSON.stringify(updated, null, 4));
  console.log(`\nbranch-coords-v2.json 업데이트 완료`);
  console.log(`  기존: ${existing.matched.length}개 → 갱신: ${updated.matched.length}개`);

  if (newMismatched.length > 0) {
    console.log(`\n⚠ 수동 확인 필요 (주소에 구 이름 없음):`);
    for (const m of newMismatched) {
      console.log(`  ${m.gu} | ${m.searchKeyword} → ${m.matchedName} | ${m.address}`);
    }
  }
  if (newNotFound.length > 0) {
    console.log(`\n⚠ 카카오에서 못 찾은 항목:`);
    for (const n of newNotFound) {
      console.log(`  ${n.gu} | ${n.searchKeyword}`);
    }
  }
}

main().catch(console.error);
