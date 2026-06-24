/**
 * scripts/merge-branch-coords.js
 *
 * data/ 폴더의 4개 좌표 파일(branch-coords.json, retry-coords.json,
 * dobong-coords.json, address-coords.json)을 하나로 합쳐
 * data/branch-coords-merged.json을 생성한다.
 *
 * 합치는 이유 (2026-06-24 논의):
 *   - 4개 파일은 같은 목적(A 목록의 좌표 채우기)을 위해 작업 과정에서
 *     순차적으로 늘어난 것일 뿐, 원래부터 분리되어 있어야 할 이유가 없음.
 *   - dobong-coords.json만 "notFound" 대신 "suspicious"라는 다른 키 이름을
 *     써서, loadBranchCoords()가 그 키를 못 찾고 에러를 던지는 사고가 있었음
 *     (2026-06-24). 병합 스크립트가 이 차이를 흡수해서, 코드(loadBranchCoords)
 *     쪽은 파일 형식 차이를 신경 쓰지 않아도 되게 만듦.
 *
 * source 태그 — 나중에 "이 좌표가 어디서 왔는지" 추적하고, 구글 시트로
 * 옮긴 뒤에도 출처를 구분할 수 있도록 각 항목에 부여:
 *   - "initial" : branch-coords.json (25개 구 1차 검색)
 *   - "retry"   : retry-coords.json (1차 실패 48건 키워드 보강 재검색)
 *   - "dobong"  : dobong-coords.json (도봉구만 별도 재검색)
 *   - "address" : address-coords.json (이름 검색도 실패해 사용자가 직접
 *                 확인한 주소로 재검색, "B에도 없는 14곳" 처리 포함)
 *
 * 중복 처리: 같은 (gu, searchKeyword) 키가 여러 파일에 걸쳐 있으면, 더
 * 나중 단계 출처를 우선 채택(주소 기반이 가장 신뢰도 높음, 그 다음 도봉구
 * 별도 검색, 그 다음 재검색, 마지막이 1차 검색)하고 어떤 항목이 어떤
 * 항목을 덮어썼는지 로그로 남김 — 조용히 덮어쓰면 나중에 추적이 안 되므로.
 *
 * 실행: node scripts/merge-branch-coords.js
 * (프로젝트 루트에서 실행해야 함 — data/ 경로를 process.cwd() 기준으로 찾음)
 */

const fs = require("fs");
const path = require("path");

// 우선순위: 숫자가 높을수록 우선 채택(나중 단계가 더 신뢰됨)
const SOURCE_PRIORITY = {
  initial: 1,
  retry: 2,
  dobong: 3,
  address: 4,
};

const FILES = [
  { fileName: "branch-coords.json", source: "initial" },
  { fileName: "retry-coords.json", source: "retry" },
  { fileName: "dobong-coords.json", source: "dobong" },
  { fileName: "address-coords.json", source: "address" },
];

function makeKey(gu, searchKeyword) {
  return `${gu}::${searchKeyword}`;
}

function loadFile(fileName) {
  const filePath = path.join(process.cwd(), "data", fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`[merge] ${fileName} 없음 — 건너뜀`);
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function main() {
  const merged = new Map(); // key -> { gu, searchKeyword, matchedName, address, roadAddress, lat, lng, source }
  let totalRead = 0;
  let totalOverwritten = 0;

  for (const { fileName, source } of FILES) {
    const parsed = loadFile(fileName);
    if (!parsed) continue;

    // matched가 없는 파일은 형식 자체가 다른 것이므로 경고만 남기고 스킵
    if (!Array.isArray(parsed.matched)) {
      console.log(`[merge] ${fileName}: "matched" 배열이 없음 — 건너뜀 (형식 확인 필요)`);
      continue;
    }

    for (const entry of parsed.matched) {
      const key = makeKey(entry.gu, entry.searchKeyword);
      totalRead++;

      const existing = merged.get(key);
      if (existing) {
        const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
        const newPriority = SOURCE_PRIORITY[source] ?? 0;

        if (newPriority <= existingPriority) {
          // 기존 항목이 더 신뢰되는 출처 — 새 항목은 버림
          console.log(
            `[merge] 중복 건너뜀 - ${key} : "${source}"(우선순위 ${newPriority}) 무시,` +
              ` 기존 "${existing.source}"(우선순위 ${existingPriority}) 유지`
          );
          continue;
        }

        console.log(
          `[merge] 중복 덮어씀 - ${key} : 기존 "${existing.source}" → 새 "${source}"` +
            ` (matchedName: "${existing.matchedName}" → "${entry.matchedName}")`
        );
        totalOverwritten++;
      }

      merged.set(key, {
        gu: entry.gu,
        searchKeyword: entry.searchKeyword,
        matchedName: entry.matchedName,
        address: entry.address ?? "",
        roadAddress: entry.roadAddress ?? "",
        lat: entry.lat,
        lng: entry.lng,
        source,
      });
    }
  }

  const result = {
    matched: Array.from(merged.values()),
    mergedAt: new Date().toISOString(),
    sourceFiles: FILES.map((f) => f.fileName),
  };

  const outPath = path.join(process.cwd(), "data", "branch-coords-merged.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  console.log("");
  console.log("=== 병합 완료 ===");
  console.log(`읽은 항목 수(중복 포함): ${totalRead}`);
  console.log(`덮어쓰기 발생 건수: ${totalOverwritten}`);
  console.log(`최종 항목 수: ${result.matched.length}`);

  const bySource = {};
  for (const item of result.matched) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }
  console.log("출처별 분포:", bySource);
  console.log(`저장 위치: ${outPath}`);
}

main();