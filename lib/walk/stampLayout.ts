/**
 * [2026-07-22 v3 — 책 산책 21-5·21-6] 스탬프 레이아웃 빌더.
 *
 * 템플릿(히어로 + 요소 조합 + 인라인 여부)을 "타이포 라인" 배열로 조립한다.
 * canvas(썸네일·방식1)와 화면캡처 카드(방식3)가 이 배열을 공유해 구성이 일치.
 * 크기는 폭 대비 비율(ratio)로 정의해 어느 해상도/카드폭이든 동일 비례로 그린다.
 */
import { WalkStampData } from "./types";
import { StampElementKey, heroParts, elementLine } from "./stampContent";
import { StampTemplate } from "./stampTemplates";

export type StampLineKind =
  | "book"
  | "hero"
  | "heroUnit"
  | "stat"
  | "meta"
  | "library"
  | "sig";

export type StampLine = { kind: StampLineKind; text: string };

/** 폰트 비율(폭 대비) + 굵기 + 톤(색 역할) + 숫자성(모노/세리프 적용 대상). */
export const LINE_STYLE: Record<
  StampLineKind,
  { size: number; weight: number; tone: "hero" | "white" | "gray"; numeric: boolean }
> = {
  book: { size: 0.038, weight: 700, tone: "white", numeric: false },
  hero: { size: 0.135, weight: 800, tone: "hero", numeric: true },
  heroUnit: { size: 0.034, weight: 500, tone: "gray", numeric: false },
  stat: { size: 0.044, weight: 700, tone: "white", numeric: true },
  meta: { size: 0.031, weight: 500, tone: "gray", numeric: false },
  library: { size: 0.034, weight: 500, tone: "white", numeric: false },
  sig: { size: 0.028, weight: 600, tone: "gray", numeric: false },
};

/** 템플릿 → 타이포 라인 배열(위→아래). */
export function buildStampLines(
  data: WalkStampData,
  tpl: StampTemplate
): StampLine[] {
  const lines: StampLine[] = [];
  const has = (k: StampElementKey) => tpl.elements.includes(k);

  // 책 (히어로가 아닐 때만 작게 위에)
  if (has("book") && tpl.hero !== "book") {
    const t = elementLine("book", data);
    if (t) lines.push({ kind: "book", text: t });
  }

  // 히어로
  const hp = tpl.hero ? heroParts(tpl.hero, data) : null;
  if (hp) {
    lines.push({ kind: "hero", text: hp.big });
    if (hp.unit) lines.push({ kind: "heroUnit", text: hp.unit });
  }

  // 스탯: 거리·걸음수·N번째(+인라인이면 날짜도) — 히어로 제외, 선택된 것
  const statKeys = (["distance", "steps", "walkCount"] as StampElementKey[]).filter(
    (k) => has(k) && k !== tpl.hero
  );
  if (tpl.inlineStats) {
    const items = [...statKeys, ...(has("datetime") ? (["datetime"] as StampElementKey[]) : [])]
      .map((k) => elementLine(k, data))
      .filter((t): t is string => Boolean(t));
    if (items.length) lines.push({ kind: "stat", text: items.join("   ·   ") });
  } else {
    const items = statKeys
      .map((k) => elementLine(k, data))
      .filter((t): t is string => Boolean(t));
    if (items.length) lines.push({ kind: "stat", text: items.join("   ·   ") });
    if (has("datetime")) {
      const t = elementLine("datetime", data);
      if (t) lines.push({ kind: "meta", text: t });
    }
  }

  // 도서관
  if (has("library")) {
    const t = elementLine("library", data);
    if (t) lines.push({ kind: "library", text: t });
  }

  // 서명은 텍스트 라인이 아니라 우하단 로고 마크로 별도 렌더(drawStamp의 mark).

  return lines;
}
