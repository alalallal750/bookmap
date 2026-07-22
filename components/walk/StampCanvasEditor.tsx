"use client";

/**
 * [2026-07-22 v3 — 책 산책 24-3] 경량 스탬프 에디터 (사진 위 DOM 레이어).
 *
 * 템플릿을 적용한 뒤 "조금만 다듬기": 각 텍스트 개체를 드래그(이동)·모서리 크기조절·
 * 문구수정/줄바꿈·숨기기 할 수 있다. 색·회전·폰트 변경, 도형/스티커 추가는 제외
 * (템플릿이 정함). 로고 서명은 편집 불가(고정).
 *
 * 미리보기는 배경(사진/색) 위에 DOM 텍스트 레이어를 얹어 모바일 제스처(드래그·탭)로
 * 다룬다. 저장 시에만 같은 레이어 배열을 drawStampLayers로 canvas에 flatten하므로
 * 미리보기와 결과가 정확히 일치(WYSIWYG)한다. 좌표·크기는 정규화(0~1, 폭 대비)라
 * 미리보기 해상도와 저장 해상도가 달라도 동일 비례로 그려진다.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WalkStampData } from "@/lib/walk/types";
import { StampTemplate, FONT_STACKS, DISPLAY_FONTS } from "@/lib/walk/stampTemplates";
import { formatBookLine } from "@/lib/walk/stampContent";
import {
  drawStampLayers,
  sizeToPx,
  StampMark,
  TextMode,
} from "@/lib/walk/drawStamp";
import {
  StampLayer,
  buildLayers,
  aspectOf,
  lhFactor,
  layerMaxWidthPx,
  resolveStampColors,
  colorForTone,
} from "@/lib/walk/stampLayers";

const SAVE_MAX = 1200; // 저장 렌더 해상도(긴 변/높이)
const MIN_SIZE = 0.02;
const MAX_SIZE = 0.6;
const TAP_SLOP = 4; // px — 이보다 적게 움직이면 탭(이동 아님)

export type EditorBg =
  | { kind: "photo"; bitmap: ImageBitmap }
  | { kind: "plain"; color: string };

async function shareOrDownloadCanvas(canvas: HTMLCanvasElement, captionText: string) {
  return new Promise<void>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve();
      const file = new File([blob], "책산책_인증.png", { type: "image/png" });
      try {
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: "책 산책 인증", text: captionText });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch {
        /* 취소 무시 */
      }
      resolve();
    }, "image/png");
  });
}

type DragState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  boxW: number;
  boxH: number;
  startNx: number;
  startNy: number;
  startSize: number;
  anchorX: number;
  anchorY: number;
  startDist: number;
  moved: boolean;
};

export function StampCanvasEditor({
  data,
  tpl,
  bg,
  textMode,
  mark,
  logoVariant,
  onReplacePhoto,
}: {
  data: WalkStampData;
  tpl: StampTemplate;
  bg: EditorBg;
  textMode: TextMode;
  mark: StampMark;
  logoVariant: "icon" | "wordmark";
  onReplacePhoto?: () => void;
}) {
  const aspect = aspectOf(bg.kind === "photo" ? { type: "image", bitmap: bg.bitmap } : { type: "color" });
  const aspectKey = bg.kind === "photo" ? `${bg.bitmap.width}x${bg.bitmap.height}` : "plain";
  const dataKey = `${data.bookTitle}|${data.libraryName}|${data.arrivedAt.getTime()}`;

  const [layers, setLayers] = useState<StampLayer[]>(() => buildLayers(data, tpl, aspect));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 템플릿·배경 종횡비·데이터가 바뀌면 기본 레이아웃으로 리셋(편집 내용 초기화).
  useEffect(() => {
    setLayers(buildLayers(data, tpl, aspect));
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl.id, aspectKey, dataKey]);

  // 렌더 박스 픽셀 크기 측정 → 폰트 크기(폭 대비 비율) 계산에 사용.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unit = Math.min(box.w, box.h);

  // 사진 배경은 canvas로 표시(ImageBitmap은 <img>에 직접 못 넣음). CSS로 박스에 맞춤.
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (bg.kind !== "photo") return;
    const c = bgCanvasRef.current;
    if (!c) return;
    c.width = bg.bitmap.width;
    c.height = bg.bitmap.height;
    c.getContext("2d")?.drawImage(bg.bitmap, 0, 0);
  }, [bg]);

  const cols = useMemo(() => resolveStampColors(textMode, tpl.accent), [textMode, tpl.accent]);
  const family = FONT_STACKS[tpl.font];
  const isDisplay = DISPLAY_FONTS.has(tpl.font);
  const markColor = textMode === "white" ? "#ffffff" : "#141414";

  // ── 제스처(드래그·크기조절) ─────────────────────────────────────
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const dragRef = useRef<DragState | null>(null);

  const updateLayer = useCallback((id: string, patch: Partial<StampLayer>) => {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > TAP_SLOP) d.moved = true;
    if (!d.moved) return;
    if (d.mode === "move") {
      const nx = Math.min(1, Math.max(0, d.startNx + dx / d.boxW));
      const ny = Math.min(1, Math.max(0, d.startNy + dy / d.boxH));
      updateLayer(d.id, { nx, ny });
    } else {
      const dist = Math.hypot(e.clientX - d.anchorX, e.clientY - d.anchorY);
      const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, (d.startSize * dist) / d.startDist));
      updateLayer(d.id, { sizeRatio: size });
    }
  }, [updateLayer]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onMove]);

  useEffect(() => endDrag, [endDrag]); // 언마운트 시 리스너 정리

  const beginMove = useCallback((e: React.PointerEvent, ly: StampLayer) => {
    e.stopPropagation();
    setSelectedId(ly.id);
    const boxEl = boxRef.current;
    if (!boxEl) return;
    const r = boxEl.getBoundingClientRect();
    dragRef.current = {
      id: ly.id, mode: "move",
      startX: e.clientX, startY: e.clientY,
      boxW: r.width, boxH: r.height,
      startNx: ly.nx, startNy: ly.ny, startSize: ly.sizeRatio,
      anchorX: 0, anchorY: 0, startDist: 1, moved: false,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }, [onMove, endDrag]);

  const beginResize = useCallback((e: React.PointerEvent, ly: StampLayer) => {
    e.stopPropagation();
    e.preventDefault();
    // 크기조절 기준점 = 개체의 좌상단(코너를 멀리 끌수록 커짐).
    const el = (e.currentTarget as HTMLElement).parentElement;
    if (!el || !boxRef.current) return;
    const lr = el.getBoundingClientRect();
    const r = boxRef.current.getBoundingClientRect();
    const anchorX = lr.left;
    const anchorY = lr.top;
    const startDist = Math.max(8, Math.hypot(e.clientX - anchorX, e.clientY - anchorY));
    dragRef.current = {
      id: ly.id, mode: "resize",
      startX: e.clientX, startY: e.clientY,
      boxW: r.width, boxH: r.height,
      startNx: ly.nx, startNy: ly.ny, startSize: ly.sizeRatio,
      anchorX, anchorY, startDist, moved: true,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }, [onMove, endDrag]);

  // ── 저장(flatten) ──────────────────────────────────────────────
  async function onSave() {
    setBusy(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = document.createElement("canvas");
      const bgArg = bg.kind === "photo"
        ? ({ type: "image", bitmap: bg.bitmap } as const)
        : ({ type: "color", color: bg.color } as const);
      drawStampLayers(canvas, layersRef.current, {
        bg: bgArg, maxDim: SAVE_MAX, family, accent: tpl.accent, textMode, mark,
      });
      await shareOrDownloadCanvas(canvas, formatBookLine(data));
    } finally {
      setBusy(false);
    }
  }

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const hiddenLayers = layers.filter((l) => l.hidden);

  const shadow = unit > 0 ? `0 ${(unit * 0.004).toFixed(1)}px ${(unit * 0.012).toFixed(1)}px ${cols.shadow}` : "none";

  return (
    <div className="w-full">
      {/* 미리보기 박스 */}
      <div
        ref={boxRef}
        onPointerDown={() => setSelectedId(null)}
        className="relative w-full mx-auto overflow-hidden rounded-2xl shadow-md select-none"
        style={{
          aspectRatio: `${aspect} / 1`,
          maxHeight: 440,
          maxWidth: bg.kind === "plain" ? 300 : undefined,
          background: bg.kind === "plain" ? bg.color : "#000",
          touchAction: "none",
        }}
      >
        {bg.kind === "photo" && (
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        {unit > 0 && layers.map((ly) => {
          if (ly.hidden) return null;
          const fs = sizeToPx(ly.sizeRatio, unit);
          const isSel = ly.id === selectedId;
          const maxW = layerMaxWidthPx(ly.align, ly.nx * box.w, box.w, unit);
          const rows = (ly.text || " ").split("\n");
          return (
            <div
              key={ly.id}
              data-layer={ly.id}
              onPointerDown={(e) => beginMove(e, ly)}
              className="absolute"
              style={{
                left: `${ly.nx * 100}%`,
                top: `${ly.ny * 100}%`,
                transform: ly.align === "center" ? "translateX(-50%)" : undefined,
                fontFamily: family,
                fontWeight: isDisplay ? 400 : ly.weight,
                fontSize: fs,
                lineHeight: lhFactor(ly.kind),
                color: colorForTone(ly.tone, cols),
                textAlign: ly.align,
                maxWidth: Math.max(24, maxW),
                textShadow: shadow,
                cursor: "grab",
                touchAction: "none",
                padding: 2,
                outline: isSel ? "1.5px dashed rgba(16,185,129,0.9)" : "none",
                outlineOffset: 2,
                borderRadius: 4,
              }}
            >
              {/* 개체별 최대폭 넘으면 …로 말줄임 — 저장 canvas의 truncate와 동일 기준. */}
              {rows.map((row, i) => (
                <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row}
                </div>
              ))}
              {isSel && (
                <span
                  onPointerDown={(e) => beginResize(e, ly)}
                  className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 shadow"
                  style={{ cursor: "nwse-resize", touchAction: "none" }}
                  aria-label="크기 조절"
                />
              )}
            </div>
          );
        })}

        {/* 우하단 서명 마크(고정·편집 불가) */}
        {unit > 0 && (
          <div
            className="absolute flex items-center gap-1 pointer-events-none"
            style={{
              right: unit * 0.05,
              bottom: unit * 0.05,
              opacity: 0.94,
            }}
          >
            <span style={{ fontSize: Math.max(8, unit * 0.021), color: markColor, fontFamily: FONT_STACKS.sans }}>
              오늘도 책 산책 with{logoVariant === "icon" ? " 지금빌려" : ""}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoVariant === "icon" ? "/walk-logo-icon.png" : "/walk-logo-wordmark.png"}
              alt="지금빌려"
              style={{
                height: unit * (logoVariant === "icon" ? 0.05 : 0.044),
                filter: textMode === "white" ? "brightness(0) invert(1)" : "brightness(0)",
                marginLeft: logoVariant === "wordmark" ? -unit * 0.008 : 0,
              }}
            />
          </div>
        )}
      </div>

      {/* 편집 컨트롤 */}
      <div className="mt-3">
        {selected ? (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-gray-500">문구 수정</span>
              <button
                onClick={() => {
                  updateLayer(selected.id, { hidden: true });
                  setSelectedId(null);
                }}
                className="text-[11px] font-semibold text-gray-500 px-2 py-1 rounded-md border border-gray-200 active:bg-gray-50"
              >
                숨기기
              </button>
            </div>
            <textarea
              value={selected.text}
              onChange={(e) => updateLayer(selected.id, { text: e.target.value })}
              rows={Math.min(4, selected.text.split("\n").length + 1)}
              className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-800 focus:outline-none focus:border-emerald-400"
              placeholder="문구 입력 (Enter로 줄바꿈)"
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              드래그로 이동 · 모서리 점을 끌어 크기 조절
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 text-center py-2">
            글자를 탭해 선택하면 이동·크기·문구를 다듬을 수 있어요
          </p>
        )}

        {/* 숨긴 개체 되살리기 */}
        {hiddenLayers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] text-gray-400">다시 표시:</span>
            {hiddenLayers.map((ly) => (
              <button
                key={ly.id}
                onClick={() => {
                  updateLayer(ly.id, { hidden: false });
                  setSelectedId(ly.id);
                }}
                className="text-[11px] px-2 py-1 rounded-full border border-gray-200 text-gray-500 active:bg-gray-50"
              >
                ＋ {chipLabel(ly)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 저장 / 사진 바꾸기 */}
      <div className="flex gap-2 mt-3">
        {onReplacePhoto && (
          <button
            onClick={onReplacePhoto}
            className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold active:bg-gray-50"
          >
            사진 바꾸기
          </button>
        )}
        <button
          onClick={onSave}
          disabled={busy}
          className={`${onReplacePhoto ? "flex-[2]" : "w-full"} py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:bg-emerald-800 disabled:opacity-60`}
        >
          {busy ? "준비 중..." : "저장 / 공유하기"}
        </button>
      </div>
    </div>
  );
}

/** 숨긴 개체 칩 라벨 — 문구 첫 줄을 짧게. */
function chipLabel(ly: StampLayer): string {
  const first = (ly.text || "").split("\n")[0].trim();
  if (!first) return "개체";
  return first.length > 8 ? first.slice(0, 8) + "…" : first;
}
