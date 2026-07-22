"use client";

/**
 * [2026-07-22 v3 — 책 산책 21-4·24-3] 도착 인증 스탬프 에디터 (템플릿 앨범 + 경량 편집).
 *
 * 데이터(거리·걸음수·책·도서관 등)는 이미 준비된 상태. 여러 완성 템플릿을 까만
 * 배경 썸네일 앨범으로 보여주고 하나 고른다. 고른 템플릿을 적용 대상에 얹는다:
 *   - 내 사진: 로컬 사진 위 경량 에디터(드래그·크기·문구·숨기기) → 저장/공유 (CORS 무관)
 *   - 기본 배경: 까만/밝은 배경 위 경량 에디터 → 저장/공유 (사진·표지 없이, CORS 무관)
 *   - 표지 카드: 표지 <img> + 오버레이 화면 → 사용자 스크린샷 (CORS 무관)
 * 표지를 canvas에 합성(방식2)은 후속(알라딘 직접/카카오 프록시).
 */

import { useEffect, useRef, useState } from "react";
// 배민 서체 self-host(@font-face 등록). canvas는 아래 fontsReady 게이트로 로딩 대기.
import "@fontsource/do-hyeon";
import "@fontsource/jua";
import "@fontsource/yeon-sung";
import "@fontsource/kirang-haerang";
import { WalkStampData } from "@/lib/walk/types";
import {
  STAMP_TEMPLATES,
  getTemplate,
  StampTemplate,
  STAMP_FONT_FAMILIES,
} from "@/lib/walk/stampTemplates";
import { drawStamp, StampMark, TextMode } from "@/lib/walk/drawStamp";
import { StampCanvasEditor } from "./StampCanvasEditor";
import { CaptureCertPage } from "./CaptureCertPage";

type Tab = "photo" | "plain" | "cover";
export type LogoVariant = "icon" | "wordmark";

const THUMB_MAX = 320;

export function StampEditor({
  data,
  logoVariant = "icon",
}: {
  data: WalkStampData;
  logoVariant?: LogoVariant;
}) {
  const [tab, setTab] = useState<Tab>("photo");
  const [tplId, setTplId] = useState(STAMP_TEMPLATES[0].id);
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState(false);
  // 텍스트 색: 사진 밝기에 따라 흰/검 선택. 배경·스크림·로고 틴트가 함께 반전.
  const [textMode, setTextMode] = useState<TextMode>("white");
  const markColor = textMode === "white" ? "#ffffff" : "#141414";
  const plainBg = textMode === "white" ? "#0b0f16" : "#f4f2ec";

  // 우하단 서명 로고 프리로드(아이콘/워드마크 둘 다). 로드되면 재렌더.
  const [logosReady, setLogosReady] = useState(0);
  const iconRef = useRef<HTMLImageElement | null>(null);
  const wordmarkRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let n = 0;
    const done = () => {
      n += 1;
      if (n >= 2) setLogosReady((v) => v + 1);
    };
    const i = new Image();
    i.onload = () => {
      iconRef.current = i;
      done();
    };
    i.onerror = done;
    i.src = "/walk-logo-icon.png";
    const wm = new Image();
    wm.onload = () => {
      wordmarkRef.current = wm;
      done();
    };
    wm.onerror = done;
    wm.src = "/walk-logo-wordmark.png";
  }, []);

  const mark: StampMark = {
    img: logoVariant === "icon" ? iconRef.current : wordmarkRef.current,
    variant: logoVariant,
    color: markColor,
  };

  // 배민 서체 로딩 게이트 — canvas는 로딩 완료 후 그려야 실제 폰트로 렌더됨.
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let alive = true;
    const sample = `${data.bookTitle}${data.bookAuthor ?? ""}${data.libraryName}0123456789km킬로미터걸음번째산책약보지금빌려책·`;
    Promise.all(STAMP_FONT_FAMILIES.map((f) => document.fonts.load(`400 40px "${f}"`, sample)))
      .then(() => document.fonts.ready)
      .then(() => alive && setFontsReady((n) => n + 1))
      .catch(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [data]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tpl = getTemplate(tplId);
  const ready = fontsReady + logosReady;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        bmp = await createImageBitmap(file);
      }
      setPhoto(bmp);
    } catch (err) {
      console.log("[StampEditor] createImageBitmap 실패:", err);
    } finally {
      setBusy(false);
      e.target.value = ""; // 같은 파일 재선택 허용
    }
  }

  return (
    <div className="w-full">
      {/* 상단: 스탬프 고르기 + 글자색 토글 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-gray-400">스탬프 고르기</p>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-400 mr-1">글자색</span>
          <button
            onClick={() => setTextMode("white")}
            className={`w-6 h-6 rounded-full border ${
              textMode === "white" ? "border-emerald-500 ring-2 ring-emerald-200" : "border-gray-300"
            }`}
            style={{ background: "#ffffff" }}
            aria-label="흰 글자"
          />
          <button
            onClick={() => setTextMode("black")}
            className={`w-6 h-6 rounded-full border ${
              textMode === "black" ? "border-emerald-500 ring-2 ring-emerald-200" : "border-gray-300"
            }`}
            style={{ background: "#141414" }}
            aria-label="검은 글자"
          />
        </div>
      </div>
      {/* 템플릿 앨범 — 썸네일 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {STAMP_TEMPLATES.map((t) => (
          <Thumbnail
            key={t.id}
            data={data}
            template={t}
            selected={t.id === tplId}
            fontsReady={ready}
            mark={mark}
            textMode={textMode}
            bgColor={plainBg}
            onClick={() => setTplId(t.id)}
          />
        ))}
      </div>

      {/* 적용 대상 탭 */}
      <div className="flex gap-1.5 mb-3">
        <TabBtn active={tab === "photo"} onClick={() => setTab("photo")}>
          내 사진
        </TabBtn>
        <TabBtn active={tab === "plain"} onClick={() => setTab("plain")}>
          기본 배경
        </TabBtn>
        <TabBtn active={tab === "cover"} onClick={() => setTab("cover")}>
          표지 카드
        </TabBtn>
      </div>

      {tab === "photo" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            className="hidden"
          />
          {!photo ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full aspect-[3/4] max-h-[380px] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 active:bg-gray-50 disabled:opacity-60"
            >
              <span className="text-3xl mb-2">📷</span>
              <span className="text-sm font-medium">사진 촬영 / 앨범에서 선택</span>
              <span className="text-xs mt-1">고른 스탬프가 사진 위에 얹혀요</span>
            </button>
          ) : (
            <StampCanvasEditor
              key={`photo-${tplId}`}
              data={data}
              tpl={tpl}
              bg={{ kind: "photo", bitmap: photo }}
              textMode={textMode}
              mark={mark}
              logoVariant={logoVariant}
              onReplacePhoto={() => fileInputRef.current?.click()}
            />
          )}
        </div>
      )}

      {tab === "plain" && (
        <StampCanvasEditor
          key={`plain-${tplId}`}
          data={data}
          tpl={tpl}
          bg={{ kind: "plain", color: plainBg }}
          textMode={textMode}
          mark={mark}
          logoVariant={logoVariant}
        />
      )}

      {tab === "cover" && (
        <div className="flex flex-col items-center">
          <CaptureCertPage
            data={data}
            template={tpl}
            logoVariant={logoVariant}
            markColor={markColor}
            textMode={textMode}
          />
          <p className="text-xs text-gray-400 mt-3 text-center leading-relaxed">
            이 화면을 <b className="text-gray-600">캡처(스크린샷)</b>해서 저장·공유하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function Thumbnail({
  data,
  template,
  selected,
  fontsReady,
  mark,
  textMode,
  bgColor,
  onClick,
}: {
  data: WalkStampData;
  template: StampTemplate;
  selected: boolean;
  fontsReady: number;
  mark: StampMark;
  textMode: TextMode;
  bgColor: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current)
      drawStamp(ref.current, data, template, { type: "color", color: bgColor }, THUMB_MAX, mark, textMode);
  }, [data, template, fontsReady, mark, textMode, bgColor]);
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
        selected ? "border-emerald-500" : "border-transparent"
      }`}
      style={{ aspectRatio: "3 / 4" }}
      aria-pressed={selected}
    >
      <canvas ref={ref} className="w-full h-full object-cover" />
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${
        active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
