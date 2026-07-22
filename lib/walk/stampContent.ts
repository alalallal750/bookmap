/**
 * [2026-07-22 v2 — 책 산책 21-5] 스탬프 요소 값/라벨 — canvas(방식1)와
 * 화면캡처(방식3)가 공용. 사용자가 요소를 능동적으로 조합하므로, 각 요소를
 * "히어로(큰 숫자+단위)" 또는 "메타(작은 한 줄)"로 뽑아 쓴다.
 */
import { WalkStampData } from "./types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 2026.07.22 (수) */
export function formatWalkDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day} (${WEEKDAYS[d.getDay()]})`;
}

/** 오후 3:24 */
export function formatWalkTime(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${mm}`;
}

/** 「제목」 저자 — 저자 없으면 제목만 */
export function formatBookLine(data: WalkStampData): string {
  return data.bookAuthor ? `「${data.bookTitle}」 ${data.bookAuthor}` : `「${data.bookTitle}」`;
}

// ── 요소(사용자 토글) ──────────────────────────────────────────────
export type StampElementKey =
  | "book"
  | "library"
  | "datetime"
  | "distance"
  | "steps"
  | "walkCount";

export const ELEMENT_LABELS: Record<StampElementKey, string> = {
  book: "책",
  library: "도서관",
  datetime: "날짜·시간",
  distance: "거리",
  steps: "걸음수",
  walkCount: "N번째",
};

// ── 히어로(크게 강조) ──────────────────────────────────────────────
export type HeroKey = "distance" | "steps" | "walkCount" | "book";

export const HERO_LABELS: Record<HeroKey, string> = {
  distance: "거리",
  steps: "걸음수",
  walkCount: "N번째",
  book: "책 제목",
};

/** 데이터가 있어야 그 요소/히어로가 렌더 가능 */
export function isDataPresent(
  key: StampElementKey | HeroKey,
  data: WalkStampData
): boolean {
  switch (key) {
    case "distance":
      return typeof data.distanceKm === "number";
    case "steps":
      return typeof data.steps === "number";
    case "walkCount":
      return typeof data.walkCount === "number" && data.walkCount > 0;
    case "book":
      return Boolean(data.bookTitle);
    case "library":
      return Boolean(data.libraryName);
    case "datetime":
      return true;
  }
}

/** 히어로: 큰 값 + 작은 단위. 데이터 없으면 null. */
export function heroParts(
  key: HeroKey,
  data: WalkStampData
): { big: string; unit?: string } | null {
  switch (key) {
    case "distance":
      return typeof data.distanceKm === "number"
        ? { big: data.distanceKm.toFixed(1), unit: "킬로미터" }
        : null;
    case "steps":
      return typeof data.steps === "number"
        ? { big: data.steps.toLocaleString(), unit: "걸음 (약)" }
        : null;
    case "walkCount":
      return typeof data.walkCount === "number" && data.walkCount > 0
        ? { big: String(data.walkCount), unit: "번째 산책" }
        : null;
    case "book":
      return { big: `「${data.bookTitle}」`, unit: data.bookAuthor };
  }
}

/** 메타(작은 한 줄) 텍스트. 없으면 null. */
export function elementLine(
  key: StampElementKey,
  data: WalkStampData
): string | null {
  switch (key) {
    case "book":
      return formatBookLine(data);
    case "library":
      return data.libraryName || null;
    case "datetime":
      return `${formatWalkDate(data.arrivedAt)}  ${formatWalkTime(data.arrivedAt)}`;
    case "distance":
      return typeof data.distanceKm === "number" ? `${data.distanceKm.toFixed(1)}km` : null;
    case "steps":
      return typeof data.steps === "number" ? `약 ${data.steps.toLocaleString()}보` : null;
    case "walkCount":
      return typeof data.walkCount === "number" && data.walkCount > 0
        ? `${data.walkCount}번째 산책`
        : null;
  }
}
