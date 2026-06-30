/**
 * missing-branches.json → branch-coords-v2.json 반영 스크립트
 *
 * 처리 방식:
 *  - matched  : kakaoResult 이름으로 카카오 재검색 → 좌표 수집
 *  - resolved (officialAddress 있음) : 주소로 카카오 geocode
 *  - resolved (lat/lng 있음) : 그대로 사용
 *  - resolved (subLocations) : 각 지점 개별 추가
 *  - skipped / needsReview   : 건너뜀
 *
 * 실행: node scripts/apply-missing-coords.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KAKAO_KEY = "a85e74481662abf212ff7a17a40b12e4";
const MISSING_PATH = path.join(__dirname, "../data/missing-branches.json");
const COORDS_PATH  = path.join(__dirname, "../data/branch-coords-v2.json");

const missing = JSON.parse(readFileSync(MISSING_PATH, "utf8"));
const coordsDb = JSON.parse(readFileSync(COORDS_PATH, "utf8"));

async function kakaoKeyword(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  return json.documents?.[0] ?? null;
}

async function kakaoAddress(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&size=1`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  return json.documents?.[0] ?? null;
}

function alreadyInDb(gu, name) {
  return coordsDb.matched.some(e => e.gu === gu && e.searchKeyword === name);
}

const newEntries = [];
const skipped = [];
const failed = [];

for (const branch of missing.branches) {
  const { gu, apiName, kakaoResult, status, officialName, officialAddress, lat, lng, subLocations } = branch;

  if (status === "skipped" || status === "needsReview") {
    skipped.push(`[SKIP] ${gu} | ${apiName}`);
    continue;
  }

  // subLocations (영등포 4개 지점)
  if (subLocations) {
    for (const sub of subLocations) {
      if (alreadyInDb(gu, sub.name)) {
        console.log(`[DUPE] ${gu} | ${sub.name}`);
        continue;
      }
      newEntries.push({
        gu,
        searchKeyword: sub.name,
        matchedName: sub.name,
        address: sub.address,
        roadAddress: sub.address,
        lat: sub.lat,
        lng: sub.lng,
      });
      console.log(`[SUB ] ${gu} | ${sub.name}`);
    }
    continue;
  }

  // resolved with lat/lng already
  if (status === "resolved" && lat && lng) {
    const name = officialName || apiName;
    if (alreadyInDb(gu, name)) { console.log(`[DUPE] ${gu} | ${name}`); continue; }
    newEntries.push({
      gu,
      searchKeyword: name,
      matchedName: name,
      address: officialAddress || "",
      roadAddress: officialAddress || "",
      lat,
      lng,
    });
    console.log(`[COOR] ${gu} | ${name}`);
    continue;
  }

  // resolved with officialAddress → geocode
  if (status === "resolved" && officialAddress) {
    const name = officialName || apiName;
    if (alreadyInDb(gu, name)) { console.log(`[DUPE] ${gu} | ${name}`); continue; }
    try {
      // 주소 geocode 먼저, 안 되면 이름+구 키워드 검색
      let doc = await kakaoAddress(officialAddress);
      if (!doc) doc = await kakaoKeyword(`${name} ${gu}`);
      if (doc) {
        const addr = doc.road_address?.address_name || doc.address?.address_name || officialAddress;
        newEntries.push({
          gu,
          searchKeyword: name,
          matchedName: officialName || doc.place_name || name,
          address: addr,
          roadAddress: addr,
          lat: doc.y || doc.road_address?.y || doc.address?.y,
          lng: doc.x || doc.road_address?.x || doc.address?.x,
        });
        console.log(`[ADDR] ${gu} | ${name} → lat=${doc.y ?? "?"} lng=${doc.x ?? "?"}`);
      } else {
        failed.push(`[FAIL] ${gu} | ${name} | 주소: ${officialAddress}`);
        console.log(`[FAIL] ${gu} | ${name}`);
      }
    } catch (e) {
      failed.push(`[ERR ] ${gu} | ${name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 150));
    continue;
  }

  // matched → kakaoResult 이름으로 재검색
  if (status === "matched" && kakaoResult) {
    const searchName = kakaoResult;
    const storeName = officialName || apiName;
    if (alreadyInDb(gu, storeName)) { console.log(`[DUPE] ${gu} | ${storeName}`); continue; }
    try {
      const doc = await kakaoKeyword(`${searchName} ${gu}`);
      if (doc && (doc.road_address_name || doc.address_name || "").includes(gu)) {
        const addr = doc.road_address_name || doc.address_name;
        newEntries.push({
          gu,
          searchKeyword: storeName,
          matchedName: doc.place_name,
          address: addr,
          roadAddress: addr,
          lat: doc.y,
          lng: doc.x,
        });
        console.log(`[KAKA] ${gu} | ${storeName} → ${doc.place_name}`);
      } else {
        failed.push(`[FAIL] ${gu} | ${storeName} | kakao: ${doc?.place_name ?? "없음"}`);
        console.log(`[FAIL] ${gu} | ${storeName}`);
      }
    } catch (e) {
      failed.push(`[ERR ] ${gu} | ${storeName}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 150));
    continue;
  }
}

console.log(`\n=== 결과 ===`);
console.log(`추가: ${newEntries.length}개`);
if (skipped.length) console.log(`건너뜀: ${skipped.length}개`);
if (failed.length) { console.log(`실패:`); failed.forEach(f => console.log(" ", f)); }

if (newEntries.length === 0) {
  console.log("추가할 항목 없음 — 종료");
  process.exit(0);
}

const updated = { matched: [...coordsDb.matched, ...newEntries] };
writeFileSync(COORDS_PATH, JSON.stringify(updated, null, 4));
console.log(`\nbranch-coords-v2.json 업데이트 완료`);
console.log(`  기존 ${coordsDb.matched.length}개 → 갱신 ${updated.matched.length}개`);
