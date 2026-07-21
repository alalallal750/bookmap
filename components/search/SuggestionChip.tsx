"use client";

import { useEffect, useRef, useState } from "react";
import { suggestions, type Suggestion } from "@/lib/data/suggestions";
import { SuggestionPopup } from "@/components/search/SuggestionPopup";

const ROTATE_MS = 8000;
const SCROLL_DELAY_MS = 1200;
const SCROLL_PX_PER_SEC = 25;

// [2026-07-17] 팝업 라벨("서울 20·30대 대출이 전월대비 급상승했어요")과 톤을
// 맞춘 축약형. 문장 전체는 421px로 칩 폭(343px)을 넘어 축약형만 사용.
// 이 라벨 길이에 맞춰 제목 창을 150→130px로 줄임(넘치는 제목은 기존
// 자동 스크롤이 처리) — 360px 폭 기기까지 안전.
// [2026-07-20] 10권 체제: mania/media는 데이터의 chipLabel(시드 책 제목 포함)이
// 우선이고, 아래는 chipLabel이 빈 항목의 폴백.
const LABEL_TEXT: Record<Suggestion["label"], string> = {
  hot: "서울 20·30대 대출 급상승",
  popular: "서울 20·30대 대출 인기",
  mania: "독자들이 함께 빌린 책",
  media: "화제의 드라마 원작",
};

/**
 * 검색창 밑 추천 문구. [2026-07-17 변경] 탭하면 바로 검색하지 않고 도서 소개
 * 팝업(SuggestionPopup)을 띄움 — 팝업의 CTA를 눌렀을 때만 그 책 제목으로
 * 그 화면(전자책이면 전자책, 종이책이면 종이책)의 검색을 실행. 페이지 이동은
 * 하지 않음(2026-07-12 논의: 데이터는 종이책 대출 기준이지만, 어느 화면에
 * 있느냐에 따라 그 화면의 검색을 실행하는 게 맞음).
 * 팝업이 떠 있는 동안 로테이션 정지, 닫으면 재개.
 * 노출 조건은 부모가 결정(idle 상태 + 검색창이 비어있을 때만 visible=true로 전달).
 */
export function SuggestionChip({
  visible,
  onPick,
  theme = "green",
}: {
  visible: boolean;
  onPick: (title: string) => void;
  /** 전자책(blue) / 종이책(green) 페이지 테마 — 강조된 책 제목 색상에 반영. */
  theme?: "blue" | "green";
}) {
  // 방문마다 노출 순서를 통째로 섞음 (카테고리 순서 그대로 도는 걸 방지).
  // 초기값은 원본 순서 — 서버/첫 렌더 일치용, 마운트 직후 셔플로 교체.
  const [order, setOrder] = useState<number[]>(() =>
    suggestions.map((_, i) => i)
  );
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const windowRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  // Fisher–Yates 셔플로 방문마다 순서 무작위화
  useEffect(() => {
    const arr = suggestions.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setOrder(arr);
    setPos(0);
  }, []);

  useEffect(() => {
    if (paused || popupOpen || !visible) return;
    const id = setInterval(() => {
      setPos((p) => (p + 1) % suggestions.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, popupOpen, visible]);

  // 제목이 창 폭보다 길면 1.2초 대기 후 한 번만 끝까지 스크롤하고 정지(무한 반복 아님)
  useEffect(() => {
    const win = windowRef.current;
    const inner = innerRef.current;
    if (!win || !inner) return;
    inner.style.transition = "none";
    inner.style.transform = "translateX(0)";
    const overflow = inner.scrollWidth - win.clientWidth;
    if (overflow <= 2) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setTimeout(() => {
      inner.style.transition = `transform ${(overflow / SCROLL_PX_PER_SEC).toFixed(2)}s linear`;
      inner.style.transform = `translateX(-${overflow}px)`;
    }, SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pos, visible]);

  if (!visible) return null;
  const current = suggestions[order[pos] ?? 0];
  if (!current) return null;

  return (
    <>
    {popupOpen && (
      <SuggestionPopup
        suggestion={current}
        theme={theme}
        onClose={() => setPopupOpen(false)}
        onSearch={(title) => {
          setPopupOpen(false);
          onPick(title);
        }}
      />
    )}
    <button
      type="button"
      onClick={() => setPopupOpen(true)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[13px] text-gray-500"
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 text-gray-400">
        <path d="M3 13l5-5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 4h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex-shrink-0">{current.chipLabel ?? LABEL_TEXT[current.label]}</span>
      <span ref={windowRef} className="max-w-[130px] overflow-hidden inline-block align-bottom">
        <span
          ref={innerRef}
          className={`inline-block whitespace-nowrap font-medium ${
            theme === "blue" ? "text-blue-600" : "text-green-600"
          }`}
        >
          &apos;{current.title}&apos;
        </span>
      </span>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 text-gray-400">
        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    </>
  );
}
