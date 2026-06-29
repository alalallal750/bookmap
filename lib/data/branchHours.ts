/**
 * lib/data/branchHours.ts
 *
 * data/slib-hours.json (서울도서관 통합 사이트 https://lib.seoul.go.kr/slibsrch/main
 * 전체 도서관 목록 1447건, 2026-06-23 다운로드)을 읽어서, 분관 이름으로
 * 운영시간·휴관일·전화번호·홈페이지를 조회하는 함수 제공.
 *
 * [중요 — 적용 범위] 이 정식 파일은 "검색 가능한 도서관 + 검색 안 되는
 * 도서관(전문도서관, 장애인도서관 등)"이 섞여 있음. 종이책 검색의 신뢰할
 * 수 있는 분관 목록 원본은 여전히 caniread 핸드오프 문서 + branchCoords.ts
 * (카카오맵 좌표 검증)임 — 이 모듈은 "그 분관 목록에 있는 이름"에 대해서만
 * 운영시간 등 보조정보를 보강하는 용도로, 목록 자체를 늘리거나 줄이는
 * 데 쓰지 않음.
 *
 * [정보 신뢰도] 정식 파일이지만 갱신일(updatedDate)이 2022~2023년인
 * 항목이 많아 오래된 정보일 수 있음(특히 운영시간/휴관일은 그 사이
 * 바뀌었을 가능성). 화면에 표시할 때 "출처: 서울도서관, 최근 갱신일
 * 불명확할 수 있음" 정도의 안내를 같이 보여주는 게 안전함.
 *
 * 매칭이 안 되는 경우(이 정식 파일에 없는 분관 — 예: 사용자가 직접 주소를
 * 확인해서 branchCoords.ts에만 있는 14곳 등)는 hours/tel 등이 그냥
 * undefined로 남음 — PhysicalLibrary 타입에서 이미 선택적(optional)
 * 필드라 별도 처리 없이 자연스럽게 빈 값으로 표시됨.
 */

import fs from "fs";
import path from "path";

type RawSlibEntry = {
  type: string;
  name: string;
  hours: string | null;
  closedDay: string | null;
  tel: string | null;
  homepage: string | null;
  gu: string;
  address: string;
  updatedDate: string;
};

export type BranchHours = {
  name: string;
  gu: string;
  type: string;
  hours?: string;
  closedDay?: string;
  tel?: string;
  homepage?: string;
  address: string;
  updatedDate: string;
};

/**
 * 1차원본(Google Sheet / coords 파일) 이름과 slib 이름이 다른 경우를 위한
 * 별칭 테이블. `findBranchHours`에서 1차 매칭 실패 시 이 맵을 통해 재시도.
 * 주로 강동구 gdlibrary 스크래퍼가 사용하는 북카페/다독다독 계열 이름 차이.
 */
const SLIB_NAME_ALIASES: Record<string, string> = {
  // 강동구: coords 이름 → slib 이름 (이름 표기 차이)
  "다독다독 길동사거리점": "북카페도서관 길동점",
  "고분다리시장점 북카페": "북카페도서관 다독다독 고분다리시장점",
  "고덕점 북카페": "북카페도서관 다독다독 고덕점",
  "암사종합시장점 북카페": "북카페도서관 다독다독 암사시장점",
  "강일점 북카페": "북카페도서관 다독다독 강일점",

  // 중랑구: 동별 작은도서관 → 새마을문고분회 이름으로 slib 등록
  "면목2동작은도서관": "새마을문고면목2동분회작은도서관",
  "면목4동작은도서관": "새마을문고면목4동분회작은도서관",
  "면목5동작은도서관": "새마을문고면목5동분회작은도서관",
  "면목7동작은도서관": "새마을문고면목7동분회작은도서관",
  "상봉1동작은도서관": "새마을문고상봉1동분회작은도서관",
  "묵1동작은도서관": "새마을문고묵1동분회작은도서관",
  "묵2동작은도서관": "새마을문고묵2동분회작은도서관",
  "망우본동작은도서관": "새마을문고망우본동분회작은도서관",
  "망우3동작은도서관": "새마을문고망우3동분회작은도서관",
  "신내1동작은도서관": "새마을문고신내1동분회작은도서관",
  "신내2동작은도서관": "신내2동북카페",
  "중화1동작은도서관": "새마을문고중화1동분회작은도서관",

  // 영등포구: 공립 명칭 차이
  "당산1동작은도서관": "당산1동 공립작은도서관",
  "당산2동작은도서관": "당산2동 공립작은도서관",
};

let cachedEntries: RawSlibEntry[] | null = null;

function loadRawEntries(): RawSlibEntry[] {
  if (cachedEntries) return cachedEntries;

  const filePath = path.join(process.cwd(), "data", "slib-hours.json");
  if (!fs.existsSync(filePath)) {
    console.log("[branchHours] slib-hours.json 없음 — 운영시간 정보 없이 진행");
    cachedEntries = [];
    return cachedEntries;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  cachedEntries = JSON.parse(raw);
  console.log(`[branchHours] loaded ${cachedEntries!.length} entries from slib-hours.json`);
  return cachedEntries!;
}

function normalize(s: string): string {
  return s.replace(/[\s&.,:|\-()]/g, "");
}

/** 더 공격적인 정규화: "작은" 제거 + 기본 정규화. 동명이인 위험이 크므로
 *  구(gu) 안에서만 사용하고, 매칭 단계의 맨 마지막 폴백으로만 시도. */
function normalizeAggressive(s: string): string {
  return normalize(s).replace(/작은/g, "");
}

/**
 * 분관 이름(+ 구 이름, 동명이인 방지용)으로 운영시간 등 조회.
 *
 * 매칭 전략: 정확히 일치 → 같은 구 안에서 정규화 후 일치 → 같은 구 안에서
 * 포함관계. 구를 넘겨주지 않으면(gu 생략) 전체에서 정규화 일치만 시도 —
 * 동명이인 위험이 있으니 가능하면 항상 gu를 같이 넘길 것.
 */
export function findBranchHours(
  libraryName: string,
  gu?: string
): BranchHours | undefined {
  const entries = loadRawEntries();
  const pool = gu ? entries.filter((e) => e.gu === gu) : entries;

  const exact = pool.find((e) => e.name === libraryName);
  if (exact) return toBranchHours(exact);

  const normalizedTarget = normalize(libraryName);
  const normalized = pool.find((e) => normalize(e.name) === normalizedTarget);
  if (normalized) return toBranchHours(normalized);

  // 구 안에서만 포함관계 허용(구 없이 전체 포함관계 검사는 동명이인
  // 위험이 너무 커서 시도하지 않음)
  if (gu) {
    const partial = pool.find((e) => {
      const n = normalize(e.name);
      return n.includes(normalizedTarget) || normalizedTarget.includes(n);
    });
    if (partial) return toBranchHours(partial);
  }

  // 별칭 테이블로 재시도
  const aliasName = SLIB_NAME_ALIASES[libraryName];
  if (aliasName) return findBranchHours(aliasName, gu);

  // "작은" 제거 후 재매칭 (같은 구 안에서만, 동명이인 위험 최소화)
  if (gu) {
    const aggTarget = normalizeAggressive(libraryName);
    const aggMatch = pool.find((e) => {
      const n = normalizeAggressive(e.name);
      return n === aggTarget || n.includes(aggTarget) || aggTarget.includes(n);
    });
    if (aggMatch) return toBranchHours(aggMatch);
  }

  return undefined;
}

function toBranchHours(e: RawSlibEntry): BranchHours {
  return {
    name: e.name,
    gu: e.gu,
    type: e.type,
    hours: e.hours ?? undefined,
    closedDay: e.closedDay ?? undefined,
    tel: e.tel ?? undefined,
    homepage: e.homepage ?? undefined,
    address: e.address,
    updatedDate: e.updatedDate,
  };
}