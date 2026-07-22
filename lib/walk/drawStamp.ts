/**
 * [2026-07-22 v3 — 책 산책 21-6·24-3] 통합 canvas 스탬프 렌더러 (레이어 기반).
 *
 * 렌더 경로가 하나다: 어떤 표면이든 "레이어 배열"을 canvas에 그린다.
 *   - 앨범 썸네일 / 템플릿 미리보기 → drawStamp(템플릿을 buildLayers로 펼침)
 *   - 경량 에디터 저장(WYSIWYG flatten) → drawStampLayers(에디터가 편집한 레이어)
 * 썸네일·에디터 미리보기·저장 결과가 같은 렌더러를 거치므로 정확히 일치한다.
 * 흰/검 텍스트 + 그림자로 배경 위에 얹는 타이포그래피(불투명 패널 없음).
 */
import { WalkStampData } from "./types";
import { StampTemplate, FONT_STACKS } from "./stampTemplates";
import {
  StampLayer,
  buildLayers,
  aspectOf,
  lhFactor,
  layerMaxWidthPx,
  resolveStampColors,
  colorForTone,
} from "./stampLayers";

export type StampBackground =
  | { type: "image"; bitmap: ImageBitmap }
  | { type: "color"; color: string };

export type TextMode = "white" | "black";

/** 우하단 고정 서명 마크(편집 불가): "오늘도 책 산책 with 지금빌려" + 로고.
 *  로고는 색 하나로 틴트(흑백 처리) — 텍스트 색과 맞춘다. */
export type StampMark = {
  img: HTMLImageElement | null;
  variant: "icon" | "wordmark";
  /** 마크 색(텍스트 화이트/블랙과 일치) */
  color: string;
};

type ImgBounds = { sx: number; sy: number; sw: number; sh: number };
const boundsCache = new WeakMap<HTMLImageElement, ImgBounds>();

/** 로고 PNG의 실제 내용(불투명 픽셀) 바운딩박스 — 투명 패딩 제거용. 1회 계산 캐시.
 *  같은 도메인 에셋이라 getImageData 가능(taint 없음). */
function getContentBounds(img: HTMLImageElement): ImgBounds {
  const cached = boundsCache.get(img);
  if (cached) return cached;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  let b: ImgBounds = { sx: 0, sy: 0, sw: w, sh: h };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d");
  if (cx && w > 0 && h > 0) {
    cx.drawImage(img, 0, 0);
    try {
      const { data } = cx.getImageData(0, 0, w, h);
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 12) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        b = { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
      }
    } catch {
      /* 보안 예외 등 — 원본 그대로 */
    }
  }
  boundsCache.set(img, b);
  return b;
}

/** 로고를 단색으로 틴트해 그림(투명 알파 유지, src 바운딩박스만 사용해 패딩 제거). */
function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  src: ImgBounds,
  x: number,
  y: number,
  dw: number,
  dh: number,
  color: string
) {
  const w = Math.max(1, Math.round(dw));
  const h = Math.max(1, Math.round(dh));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const o = off.getContext("2d");
  if (!o) return;
  o.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
  o.globalCompositeOperation = "source-in";
  o.fillStyle = color;
  o.fillRect(0, 0, w, h);
  ctx.drawImage(off, x, y, dw, dh);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** 우하단 서명 마크(고정·편집 불가, 모든 개체 중 가장 작게)를 그림. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  unit: number,
  mark: StampMark
) {
  const tagline =
    mark.variant === "icon" ? "오늘도 책 산책 with 지금빌려" : "오늘도 책 산책 with";
  const markMargin = Math.round(unit * 0.05);
  // 태그라인 텍스트는 로고 이미지 크기 유지한 채 20% 축소
  const fs = Math.max(8, Math.round(unit * 0.021));
  const logoH = Math.round(unit * (mark.variant === "icon" ? 0.05 : 0.044));
  const bounds = mark.img ? getContentBounds(mark.img) : null;
  const aspect = bounds ? bounds.sw / bounds.sh : 1;
  const logoW = Math.round(logoH * aspect);
  const gap = Math.round(unit * 0.012);

  ctx.font = `500 ${fs}px ${FONT_STACKS.sans}`;
  const tw = Math.round(ctx.measureText(tagline).width);
  const totalW = tw + (bounds ? gap + logoW : 0);
  const bx = w - markMargin - totalW;
  const cy = h - markMargin - logoH / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = mark.color;
  ctx.fillText(tagline, bx, cy);
  if (mark.img && bounds) {
    drawTintedImage(ctx, mark.img, bounds, bx + tw + gap, cy - logoH / 2, logoW, logoH, mark.color);
  }
}

export type DrawLayersOpts = {
  bg: StampBackground;
  /** 이미지 배경이면 긴 변 상한(다운스케일). 색 배경이면 높이(3:4 세로). */
  maxDim: number;
  /** 폰트 스택(템플릿 폰트 = 편집 불가). */
  family: string;
  /** 히어로 강조색(템플릿). */
  accent: string;
  textMode: TextMode;
  mark?: StampMark;
};

/**
 * 레이어 배열을 canvas에 렌더 — 경량 에디터의 저장(flatten)과 템플릿 렌더의 공용 코어.
 * 각 레이어는 정규화 좌표(nx,ny)·크기(sizeRatio)를 가지며 자유 배치된다.
 */
export function drawStampLayers(
  canvas: HTMLCanvasElement,
  layers: StampLayer[],
  opts: DrawLayersOpts
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { bg, maxDim, family, accent, textMode, mark } = opts;

  let w: number;
  let h: number;
  if (bg.type === "image") {
    const scale = Math.min(1, maxDim / Math.max(bg.bitmap.width, bg.bitmap.height));
    w = Math.round(bg.bitmap.width * scale);
    h = Math.round(bg.bitmap.height * scale);
  } else {
    h = maxDim;
    w = Math.round(maxDim * 0.75); // 3:4 세로
  }
  canvas.width = w;
  canvas.height = h;

  if (bg.type === "image") {
    ctx.drawImage(bg.bitmap, 0, 0, w, h);
  } else {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
  }

  const unit = Math.min(w, h);
  const cols = resolveStampColors(textMode, accent);

  ctx.shadowColor = cols.shadow;
  ctx.shadowBlur = Math.round(unit * 0.012);
  ctx.shadowOffsetY = Math.round(unit * 0.004);
  ctx.textBaseline = "top";

  for (const ly of layers) {
    if (ly.hidden || !ly.text.trim()) continue;
    const fs = Math.max(9, sizeToPx(ly.sizeRatio, unit));
    const lh = fs * lhFactor(ly.kind);
    ctx.font = `${ly.weight} ${fs}px ${family}`;
    ctx.fillStyle = colorForTone(ly.tone, cols);
    ctx.textAlign = ly.align === "center" ? "center" : "left";
    const px = ly.nx * w;
    const top = ly.ny * h;
    const maxW = layerMaxWidthPx(ly.align, px, w, unit);
    const rows = ly.text.split("\n");
    rows.forEach((row, i) => {
      // 앵커 기준 최대폭 넘으면 …로 말줄임(DOM 미리보기와 동일 기준). 캔버스는
      // 가장자리에서도 자동 클립되지만, 말줄임이 깔끔하고 WYSIWYG가 정합.
      const t = truncate(ctx, row, maxW);
      // 라인 스트립 내부 세로 중앙 정렬 — DOM line-height 렌더와 위치 일치
      ctx.fillText(t, px, top + i * lh + (lh - fs) / 2);
    });
  }

  if (mark) drawMark(ctx, w, h, unit, mark);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** sizeRatio(폭 대비) → px. renderer·에디터 공용. */
export function sizeToPx(sizeRatio: number, unit: number): number {
  return Math.round(sizeRatio * unit);
}

/**
 * 템플릿을 그 자리에서 레이어로 펼쳐 그린다(썸네일·템플릿 미리보기). 편집 없는 경로.
 * 기존 호출부 호환용 — 시그니처 동일.
 */
export function drawStamp(
  canvas: HTMLCanvasElement,
  data: WalkStampData,
  tpl: StampTemplate,
  bg: StampBackground,
  maxDim: number,
  mark?: StampMark,
  textMode: TextMode = "white"
) {
  const layers = buildLayers(data, tpl, aspectOf(bg));
  drawStampLayers(canvas, layers, {
    bg,
    maxDim,
    family: FONT_STACKS[tpl.font],
    accent: tpl.accent,
    textMode,
    mark,
  });
}
