/**
 * COORD-MISS 전수조사 스크립트
 * 10개 ISBN으로 meta.seoul.go.kr API를 호출해서,
 * 반환된 도서관 이름이 branch-coords-v2.json과 매칭되는지 확인.
 *
 * 실행: node scripts/survey-coord-miss.mjs
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BRANCH_COORDS = JSON.parse(
  readFileSync(path.join(__dirname, "../data/branch-coords-v2.json"), "utf8")
);

// branch-coords-v2.json에서 구::이름 → 좌표 맵 구성
const coordMap = new Map(); // normalize(gu+name) → true
for (const entry of BRANCH_COORDS.matched) {
  coordMap.set(entry.gu + "::" + entry.searchKeyword, true);
}

const normalize = (s) => s.replace(/[\s&\[\]{}\(\),·]/g, "");

function findCoord(gu, branchName) {
  const normBranch = normalize(branchName);
  // 1. 정확히 일치
  if (coordMap.has(gu + "::" + branchName)) return "exact";
  // 2. 정규화 후 substring 포함 (브랜치 이름이 DB 이름을 포함하거나 역방향)
  for (const entry of BRANCH_COORDS.matched) {
    if (entry.gu !== gu) continue;
    const normDB = normalize(entry.searchKeyword);
    if (normDB.includes(normBranch) || normBranch.includes(normDB)) return "normalized";
  }
  return null;
}

// 25개 구 dbnum
const DISTRICTS = [
  { gu: "동작구", dbnum: "43641" },
  { gu: "관악구", dbnum: "42921" },
  { gu: "중랑구", dbnum: "99071" },
  { gu: "용산구", dbnum: "88341" },
  { gu: "광진구", dbnum: "19071" },
  { gu: "동대문구", dbnum: "68831" },
  { gu: "도봉구", dbnum: "43361" },
  { gu: "노원구", dbnum: "43081" },
  { gu: "성동구", dbnum: "34141" },
  { gu: "은평구", dbnum: "33451" },
  { gu: "송파구", dbnum: "44381" },
  { gu: "종로구", dbnum: "88361" },
  { gu: "중구", dbnum: "44701" },
  { gu: "구로구", dbnum: "42331" },
  { gu: "강북구", dbnum: "88351" },
  { gu: "강동구", dbnum: "21841" },
  { gu: "서초구", dbnum: "88431" },
  { gu: "양천구", dbnum: "44451" },
  { gu: "강남구", dbnum: "50421" },
  { gu: "강서구", dbnum: "42871" },
  { gu: "성북구", dbnum: "44301" },
  { gu: "마포구", dbnum: "88421" },
  { gu: "서대문구", dbnum: "43921" },
  { gu: "영등포구", dbnum: "88631" },
];

// dbnum → gu 맵
const dbnumToGu = new Map(DISTRICTS.map((d) => [d.dbnum, d.gu]));

const BASE_URL = "https://meta.seoul.go.kr/libseoul";
const TIMEOUT_MS = 20000;

// 10개 테스트 ISBN
const TEST_ISBNS = [
  { isbn: "9791161571188", title: "불편한 편의점" },
  { isbn: "9788936434595", title: "채식주의자" },
  { isbn: "9791190090032", title: "나인폭스 갬빗(or 아몬드)" },
  { isbn: "9791165341909", title: "달러구트 꿈 백화점" },
  { isbn: "9788959896691", title: "사죄없는사과사회(or 트렌드코리아)" },
  { isbn: "9791191056556", title: "미드나잇 라이브러리" },
  { isbn: "9791168340510", title: "파친코 1권" },
  { isbn: "9788937460449", title: "데미안" },
  { isbn: "9788937460876", title: "그 후(or 데미안2)" },
  { isbn: "9788936433598", title: "채식주의자(구판)" },
];

function generateId() {
  return Math.floor(Math.random() * 1e15).toString();
}

async function fetchSession() {
  const res = await fetch(`${BASE_URL}/index.php/default_search`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function fetchIsbnResults(dbnum, isbn, id, cookie) {
  const url =
    `${BASE_URL}/index.php/ajax/engine/deploy` +
    `?id=${id}&category1=7&category2=0&category3=0` +
    `&text1=${encodeURIComponent(isbn)}&text2=&text3=` +
    `&op=0&op2=0&year1=&year2=` +
    `&dbnum=${dbnum}&display=200&recstart=1&sort=rel&_=${Date.now()}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(cookie ? { Cookie: cookie } : {}),
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/index.php/default_search`,
        Accept: "text/xml, application/xml, */*",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (/<resultinfo[^>]*>\s*Failed\s*<\/resultinfo>/.test(xml)) return [];

    // 도서관 이름과 ISBN 추출
    const records = [];
    const recordMatches = xml.matchAll(/<record\b[^>]*>([\s\S]*?)<\/record>/g);
    for (const m of recordMatches) {
      const block = m[1];
      const isbnMatch = block.match(/<field[^>]*name="ISBN"[^>]*>[\s\S]*?<content><!\[CDATA\[([^\]]*)\]\]><\/content>/);
      const libMatch = block.match(/<field[^>]*name="도서관"[^>]*>[\s\S]*?<content><!\[CDATA\[([^\]]*)\]\]><\/content>/);
      const locMatch = block.match(/<field[^>]*name="Location"[^>]*>[\s\S]*?<content><!\[CDATA\[([^\]]*)\]\]><\/content>/);
      const recIsbn = isbnMatch?.[1]?.trim() ?? "";
      const libName = libMatch?.[1]?.trim() ?? "";
      const location = locMatch?.[1]?.trim() ?? "";
      if (recIsbn) records.push({ isbn: recIsbn, libName, location, dbnum });
    }
    return records;
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== COORD-MISS 전수조사 ===\n");

  let cookie = "";
  try {
    cookie = await fetchSession();
    console.log("세션 확보 완료\n");
  } catch {
    console.log("세션 확보 실패, 쿠키 없이 진행\n");
  }

  // 구별로 MISS 수집
  const missMap = new Map(); // gu → Set(branchName)
  const hitMap = new Map();  // gu → Set(branchName)

  for (const { isbn, title } of TEST_ISBNS) {
    console.log(`[${title}] ISBN ${isbn} 검색 중...`);
    const id = generateId();

    const results = await Promise.all(
      DISTRICTS.map((d) => fetchIsbnResults(d.dbnum, isbn, id, cookie))
    );

    let totalHit = 0, totalMiss = 0;
    for (const records of results) {
      for (const rec of records) {
        const gu = dbnumToGu.get(rec.dbnum);
        if (!gu) continue;

        const branchName = rec.libName || rec.location || "";
        if (!branchName) continue;

        const matched = findCoord(gu, branchName);
        if (matched) {
          totalHit++;
          if (!hitMap.has(gu)) hitMap.set(gu, new Set());
          hitMap.get(gu).add(branchName);
        } else {
          totalMiss++;
          if (!missMap.has(gu)) missMap.set(gu, new Set());
          missMap.get(gu).add(branchName);
        }
      }
    }
    console.log(`  → 매칭: ${totalHit}건, MISS: ${totalMiss}건`);
  }

  console.log("\n\n=== 결과: 구별 COORD-MISS 목록 ===\n");

  let grandTotalMiss = 0;
  const guOrder = [...missMap.keys()].sort();
  for (const gu of guOrder) {
    const misses = [...missMap.get(gu)].sort();
    grandTotalMiss += misses.length;
    console.log(`【${gu}】 ${misses.length}개`);
    for (const name of misses) {
      console.log(`  MISS  ${name}`);
    }
  }

  console.log("\n=== 매칭 성공한 구별 도서관 수 ===\n");
  for (const gu of [...hitMap.keys()].sort()) {
    console.log(`  ${gu}: ${hitMap.get(gu).size}개 매칭됨`);
  }

  console.log(`\n총 COORD-MISS 고유 도서관: ${grandTotalMiss}개`);
  console.log("완료.");
}

main().catch(console.error);
