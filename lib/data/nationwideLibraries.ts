/**
 * 전국 정보나루 참여관 로더 — data/naru-libs/{region}.json (시도별) 정적
 * 데이터 조회. 생성 스크립트로 재생성 — 수동 편집 금지.
 *
 * 서버 전용(API 라우트에서 사용). 서울판 naruLibraries.ts와 별개 파일
 * (기존 서울 파이프라인 무수정 원칙 — 서울도 여기 포함돼 있지만 기존
 * 코드는 계속 naruLibraries.ts를 쓴다).
 *
 * 재생성: "지금빌려 claude code" 폴더에서 node gen_nationwide_libraries.mjs
 * 생성일: 2026-07-18 (전국 1602관, 제외 0건)
 */

import libs11 from "@/data/naru-libs/11.json";
import libs21 from "@/data/naru-libs/21.json";
import libs22 from "@/data/naru-libs/22.json";
import libs23 from "@/data/naru-libs/23.json";
import libs24 from "@/data/naru-libs/24.json";
import libs25 from "@/data/naru-libs/25.json";
import libs26 from "@/data/naru-libs/26.json";
import libs29 from "@/data/naru-libs/29.json";
import libs31 from "@/data/naru-libs/31.json";
import libs32 from "@/data/naru-libs/32.json";
import libs33 from "@/data/naru-libs/33.json";
import libs34 from "@/data/naru-libs/34.json";
import libs35 from "@/data/naru-libs/35.json";
import libs36 from "@/data/naru-libs/36.json";
import libs37 from "@/data/naru-libs/37.json";
import libs38 from "@/data/naru-libs/38.json";
import libs39 from "@/data/naru-libs/39.json";

export type NationwideLibrary = {
  libCode: string;
  libName: string;
  /** 시군구 검색 단위 코드 (searchUnits.ts의 code) */
  dtlRegion: string;
  latitude: number;
  longitude: number;
  address?: string;
  tel?: string;
  homepage?: string;
};

const ALL: NationwideLibrary[] = [
  ...(libs11 as NationwideLibrary[]),
  ...(libs21 as NationwideLibrary[]),
  ...(libs22 as NationwideLibrary[]),
  ...(libs23 as NationwideLibrary[]),
  ...(libs24 as NationwideLibrary[]),
  ...(libs25 as NationwideLibrary[]),
  ...(libs26 as NationwideLibrary[]),
  ...(libs29 as NationwideLibrary[]),
  ...(libs31 as NationwideLibrary[]),
  ...(libs32 as NationwideLibrary[]),
  ...(libs33 as NationwideLibrary[]),
  ...(libs34 as NationwideLibrary[]),
  ...(libs35 as NationwideLibrary[]),
  ...(libs36 as NationwideLibrary[]),
  ...(libs37 as NationwideLibrary[]),
  ...(libs38 as NationwideLibrary[]),
  ...(libs39 as NationwideLibrary[]),
];

const byUnit = new Map<string, NationwideLibrary[]>();
const byCode = new Map<string, NationwideLibrary>();
for (const lib of ALL) {
  const list = byUnit.get(lib.dtlRegion) ?? [];
  list.push(lib);
  byUnit.set(lib.dtlRegion, list);
  byCode.set(lib.libCode, lib);
}

/** 시군구 검색 단위 코드로 그 지역 참여관 목록 */
export function getLibrariesByUnit(dtlRegion: string): NationwideLibrary[] {
  return byUnit.get(dtlRegion) ?? [];
}

export function getLibraryByCode(libCode: string): NationwideLibrary | undefined {
  return byCode.get(libCode);
}
