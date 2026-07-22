/**
 * [2026-07-22 v3 — 책 산책 24-3] 스탬프 "레이어" 모델 + 어댑터.
 *
 * 경량 에디터를 위해 스탬프를 "템플릿 → 고정 레이아웃"에서 "레이어 배열(각 개체 =
 * 텍스트 + 정규화 좌표 + 크기) 렌더"로 일반화한다. 좌표·크기를 정규화(0~1, 폭 대비
 * 비율)해 두면 미리보기 DOM(한 해상도)과 저장 canvas(다른 해상도)가 동일 비례로
 * 그려져 WYSIWYG가 정합한다.
 *
 * buildLayers는 기존 buildStampLines의 세로 스택 배치를 정규화 좌표로 그대로 재현한다
 * (사용자가 아무것도 안 건드리면 예전과 같은 구성). 이후 각 레이어는 독립 개체로
 * 자유 이동·크기조절·문구수정·숨기기가 가능하다.
 */
import { WalkStampData } from "./types";
import { StampTemplate, DISPLAY_FONTS } from "./stampTemplates";
import { buildStampLines, LINE_STYLE, StampLineKind } from "./stampLayout";
import type { TextMode } from "./drawStamp";

export type StampLayer = {
  id: string;
  kind: StampLineKind;
  /** 표시 문구 — 사용자 수정 가능(줄바꿈 \n 허용). */
  text: string;
  /** 정규화 x. align=left면 좌상단 x, align=center면 상단-중앙 x. (÷폭) */
  nx: number;
  /** 정규화 y — 라인박스 상단(÷높이). */
  ny: number;
  /** 폰트 크기 = sizeRatio × min(폭,높이). 크기조절이 이 값을 바꾼다. */
  sizeRatio: number;
  align: "left" | "center";
  /** 색 역할(화이트/블랙 모드·accent에 매핑). */
  tone: "hero" | "white" | "gray";
  weight: number;
  hidden: boolean;
};

/** 라인 높이 배수 — hero는 촘촘히, 나머지는 여유. DOM(line-height)·canvas 공용. */
export function lhFactor(kind: StampLineKind): number {
  return kind === "hero" ? 1.08 : 1.36;
}

/**
 * 개체의 앵커(nx) 기준 최대 렌더 폭(px). 넘치면 …로 말줄임 — DOM·canvas 공용.
 * left=앵커 오른쪽 남은 폭, center=앵커 중심 기준 좌우 대칭 폭.
 */
export function layerMaxWidthPx(
  align: "left" | "center",
  px: number,
  w: number,
  unit: number
): number {
  const margin = unit * 0.04;
  return align === "center" ? 2 * Math.min(px, w - px) - margin : w - px - margin;
}

/** 배경 종횡비(폭÷높이). 이미지=비트맵 비율, 색배경=3:4 세로. */
export function aspectOf(bg: { type: "image"; bitmap: ImageBitmap } | { type: "color" }): number {
  return bg.type === "image" ? bg.bitmap.width / bg.bitmap.height : 0.75;
}

/** 화이트/블랙 모드 + accent → 실제 색. DOM 미리보기와 canvas가 공유. */
export function resolveStampColors(textMode: TextMode, accent: string) {
  const dark = textMode === "white";
  return {
    hero: dark ? accent : "#141414",
    white: dark ? "#ffffff" : "#141414",
    gray: dark ? "rgba(255,255,255,0.82)" : "rgba(20,20,20,0.66)",
    shadow: dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)",
  };
}

export function colorForTone(
  tone: "hero" | "white" | "gray",
  c: ReturnType<typeof resolveStampColors>
): string {
  return tone === "hero" ? c.hero : tone === "white" ? c.white : c.gray;
}

/**
 * 템플릿 → 초기 레이어 배열. 기존 drawStamp의 세로 스택 배치(폰트 비율·정렬·상하
 * 위치·과대 축소)를 정규화 좌표(H=1, W=aspect)로 재현한다.
 */
export function buildLayers(
  data: WalkStampData,
  tpl: StampTemplate,
  aspect: number
): StampLayer[] {
  const lines = buildStampLines(data, tpl);
  const isDisplay = DISPLAY_FONTS.has(tpl.font);
  const isTop = tpl.pos === "topLeft";
  const isMid = tpl.pos === "center";
  const isCenter = tpl.pos === "bottomCenter" || tpl.pos === "center";
  const unit = Math.min(aspect, 1); // min(W,H) in H-units

  // 1) 각 라인 크기(정규화 H-units)
  const sized = lines.map((ln) => {
    const st = LINE_STYLE[ln.kind];
    const ratio = ln.kind === "hero" && tpl.hero === "book" ? 0.07 : st.size;
    const fs = ratio * unit;
    const lh = fs * lhFactor(ln.kind);
    const weight = isDisplay ? 400 : st.weight;
    return { ln, fs, lh, weight, tone: st.tone };
  });

  // 2) 과대 블록 축소(가로 사진 안전장치) — drawStamp와 동일 규칙
  let total = sized.reduce((s, l) => s + l.lh, 0);
  const maxBlock = isMid ? 0.9 : 0.66;
  let k = 1;
  if (total > maxBlock) {
    k = maxBlock / total;
    for (const l of sized) {
      l.fs *= k;
      l.lh *= k;
    }
    total = maxBlock;
  }

  // 3) 상하 위치
  const startY = isTop ? 0.06 : isMid ? (1 - total) / 2 : 1 - 0.06 - total;
  const nx = isCenter ? 0.5 : 0.07;
  const align: "left" | "center" = isCenter ? "center" : "left";

  const layers: StampLayer[] = [];
  let cursor = startY;
  sized.forEach(({ ln, fs, lh, weight, tone }, i) => {
    layers.push({
      id: `${ln.kind}-${i}`,
      kind: ln.kind,
      text: ln.text,
      nx,
      ny: cursor,
      sizeRatio: fs / unit,
      align,
      tone,
      weight,
      hidden: false,
    });
    cursor += lh;
  });
  return layers;
}
