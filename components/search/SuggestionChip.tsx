"use client";

import { useEffect, useRef, useState } from "react";
import { suggestions, type Suggestion } from "@/lib/data/suggestions";

const ROTATE_MS = 8000;
const SCROLL_DELAY_MS = 1200;
const SCROLL_PX_PER_SEC = 25;

const LABEL_TEXT: Record<Suggestion["label"], string> = {
  hot: "2030 급상승",
  popular: "2030 인기",
};

/**
 * 검색창 밑 추천 문구. 탭하면 그 책 제목으로 그 화면(전자책이면 전자책,
 * 종이책이면 종이책)의 검색을 바로 실행 — 페이지 이동은 하지 않음(2026-07-12 논의:
 * 데이터는 종이책 대출 기준이지만, 어느 화면에 있느냐에 따라 그 화면의 검색을
 * 실행하는 게 맞음. 정보나루 대출 데이터라 종이책 소장 자체는 항상 보장되지만
 * 전자책은 그렇지 않을 수 있음 — 화면 그대로 검색해 결과를 보여주는 것으로 처리).
 * 노출 조건은 부모가 결정(idle 상태 + 검색창이 비어있을 때만 visible=true로 전달).
 */
export function SuggestionChip({
  visible,
  onPick,
}: {
  visible: boolean;
  onPick: (title: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const windowRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  // 방문마다 랜덤 시작 도서
  useEffect(() => {
    setIndex(Math.floor(Math.random() * suggestions.length));
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % suggestions.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, visible]);

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
  }, [index, visible]);

  if (!visible) return null;
  const current = suggestions[index];
  if (!current) return null;

  return (
    <button
      type="button"
      onClick={() => onPick(current.title)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[13px] text-gray-500"
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 text-gray-400">
        <path d="M3 13l5-5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 4h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex-shrink-0">{LABEL_TEXT[current.label]}</span>
      <span ref={windowRef} className="max-w-[150px] overflow-hidden inline-block align-bottom">
        <span ref={innerRef} className="inline-block whitespace-nowrap font-medium text-blue-600">
          &apos;{current.title}&apos;
        </span>
      </span>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 text-gray-400">
        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
