/**
 * [2026-07-22 v3 — 책 산책 21-6] 통합 canvas 스탬프 렌더러.
 *
 * 같은 함수로 (1) 앨범 썸네일(까만 배경), (2) 방식1 사진 합성(사용자 사진 배경)을
 * 모두 그린다 — 썸네일과 실제 결과가 정확히 일치한다. 흰 텍스트+그림자로 배경 위에
 * 얹는 타이포그래피(불투명 패널 없음). 템플릿의 폰트(sans/serif/mono)·배치·강조색을
 * 반영한다.
 */
import { WalkStampData } from "./types";
import { StampTemplate, FONT_STACKS, DISPLAY_FONTS } from "./stampTemplates";
import { buildStampLines, LINE_STYLE } from "./stampLayout";

export type StampBackground =
  | { type: "image"; bitmap: ImageBitmap }
  | { type: "color"; color: string };

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

/**
 * @param maxDim 이미지 배경이면 긴 변 상한(다운스케일). 색 배경이면 높이(3:4 세로).
 */
export type TextMode = "white" | "black";

export function drawStamp(
  canvas: HTMLCanvasElement,
  data: WalkStampData,
  tpl: StampTemplate,
  bg: StampBackground,
  maxDim: number,
  mark?: StampMark,
  textMode: TextMode = "white"
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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
    // 지정 배경색으로 채움(화이트/블랙 모드에 따라 어둡게/밝게)
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
  }

  const family = FONT_STACKS[tpl.font];
  const isDisplay = DISPLAY_FONTS.has(tpl.font);

  // [가로/세로 대응] 폰트·마크 크기는 "짧은 변" 기준 — 가로 사진에서 글자가
  // 과대해지지 않고, 세로 폰 사진(주 사용처)에선 기존과 동일하게 나온다.
  const unit = Math.min(w, h);

  // [화이트/블랙 토글] dark=흰 텍스트(어두운 배경용), light=검은 텍스트(밝은 배경용).
  const dark = textMode === "white";
  const heroCol = dark ? tpl.accent : "#141414";
  const whiteCol = dark ? "#ffffff" : "#141414";
  const grayCol = dark ? "rgba(255,255,255,0.82)" : "rgba(20,20,20,0.66)";
  const scrimRGB = dark ? "0,0,0" : "255,255,255";
  const shadowCol = dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)";
  const colorFor = (tone: "hero" | "white" | "gray") =>
    tone === "hero" ? heroCol : tone === "white" ? whiteCol : grayCol;

  const lines = buildStampLines(data, tpl);
  const marginX = Math.round(w * 0.07);
  const marginY = Math.round(h * 0.06);
  const maxTextW = w - marginX * 2;

  const isTop = tpl.pos === "topLeft";
  const isMid = tpl.pos === "center";
  const isCenter = tpl.pos === "bottomCenter" || tpl.pos === "center";

  let sized = lines.map((ln) => {
    const st = LINE_STYLE[ln.kind];
    const ratio = ln.kind === "hero" && tpl.hero === "book" ? 0.07 : st.size;
    const fontSize = Math.max(9, Math.round(unit * ratio));
    const lh = Math.round(fontSize * (ln.kind === "hero" ? 1.08 : 1.36));
    // 배민 디스플레이 폰트는 단일 웨이트 — 가짜 볼드 방지 위해 400 고정
    const weight = isDisplay ? 400 : st.weight;
    return { ...ln, fontSize, lh, weight, tone: st.tone, font: family };
  });
  let total = sized.reduce((s, l) => s + l.lh, 0);

  // [가로 대응 안전장치] 블록이 높이를 넘치면 전체 축소.
  const maxBlock = h * (isMid ? 0.9 : 0.66);
  if (total > maxBlock) {
    const k = maxBlock / total;
    sized = sized.map((l) => ({
      ...l,
      fontSize: Math.max(9, Math.round(l.fontSize * k)),
      lh: Math.max(1, Math.round(l.lh * k)),
    }));
    total = sized.reduce((s, l) => s + l.lh, 0);
  }

  let y = isTop ? marginY : isMid ? Math.round((h - total) / 2) : h - marginY - total;
  const x = isCenter ? Math.round(w / 2) : marginX;
  ctx.textAlign = isCenter ? "center" : "left";
  ctx.textBaseline = "alphabetic";

  // 가독성 스크림(텍스트 모드에 따라 어둡게/밝게 반전)
  const scrimH = Math.round(total + h * 0.1);
  if (isTop) {
    const gr = ctx.createLinearGradient(0, 0, 0, scrimH);
    gr.addColorStop(0, `rgba(${scrimRGB},0.42)`);
    gr.addColorStop(1, `rgba(${scrimRGB},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, scrimH);
  } else if (!isMid) {
    const gr = ctx.createLinearGradient(0, h, 0, h - scrimH);
    gr.addColorStop(0, `rgba(${scrimRGB},0.42)`);
    gr.addColorStop(1, `rgba(${scrimRGB},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, h - scrimH, w, scrimH);
  }

  ctx.shadowColor = shadowCol;
  ctx.shadowBlur = Math.round(unit * 0.012);
  ctx.shadowOffsetY = Math.round(unit * 0.004);

  for (const l of sized) {
    ctx.font = `${l.weight} ${l.fontSize}px ${l.font}`;
    ctx.fillStyle = colorFor(l.tone);
    ctx.fillText(truncate(ctx, l.text, maxTextW), x, y + l.fontSize);
    y += l.lh;
  }

  // ── 우하단 서명 마크(고정·편집 불가, 모든 개체 중 가장 작게) ──
  if (mark) {
    const tagline =
      mark.variant === "icon" ? "오늘도 책 산책 with 지금빌려" : "오늘도 책 산책 with";
    const markMargin = Math.round(unit * 0.05);
    // 태그라인 텍스트는 로고 이미지 크기 유지한 채 20% 축소(기존 0.026 → 0.021)
    const fs = Math.max(8, Math.round(unit * 0.021));
    const logoH = Math.round(unit * (mark.variant === "icon" ? 0.05 : 0.044));
    // 투명 패딩 제거한 실제 내용 바운딩박스로 종횡비 계산 → 좌측 여백 제거
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

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
