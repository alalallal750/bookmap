"use client";

import { useEffect } from "react";
import type { Suggestion } from "@/lib/data/suggestions";

// 칩의 짧은 라벨(2030 급상승/인기)과 달리 팝업은 폭이 넉넉해 선정 이유를
// 문장으로 풀어서 표시 (2026-07-17 요청)
// [2026-07-20] 10권 체제: mania/media는 데이터의 popupLabel(시드 책 제목 포함)이
// 우선, 아래는 폴백.
const LABEL_TEXT: Record<Suggestion["label"], string> = {
  hot: "서울 20·30대 대출이 전월대비 급상승했어요",
  popular: "서울 20·30대 대출 순위가 높아요",
  mania: "독자들이 함께 많이 빌린 책이에요",
  media: "화제의 드라마 원작 소설이에요",
};

// 대출 통계 한 줄 — 검증된 값만 표시(전국 순위 50위 이내, 그룹 1~3위).
// 건수 단독은 규모가 작으면 역효과라 300회 이상일 때만.
function storyLine(s: Suggestion): string | null {
  const st = s.story;
  if (!st) return null;
  const monthNum = parseInt(st.month.split("-")[1] ?? "", 10);
  const m = Number.isFinite(monthNum) ? `${monthNum}월` : "지난달";
  const parts: string[] = [];
  if (st.lastMonthRank) parts.push(`${m} 전국 도서관 대출 ${st.lastMonthRank}위`);
  else if (st.lastMonthLoanCnt && st.lastMonthLoanCnt >= 300)
    parts.push(`${m} 전국 도서관 대출 ${st.lastMonthLoanCnt.toLocaleString()}회`);
  if (st.topGroup)
    parts.push(
      st.topGroupRank === 1
        ? `${st.topGroup}이 가장 많이 빌렸어요`
        : `${st.topGroup} 대출 ${st.topGroupRank}위`
    );
  return parts.length ? parts.join(" · ") : null;
}

/**
 * [2026-07-17 신규] 추천 칩을 탭하면 뜨는 도서 소개 팝업.
 * - 우상단 닫기 → 그냥 닫힘 (검색 idle 화면 그대로, 칩 로테이션 재개)
 * - 하단 CTA → 그 화면(전자책/종이책)의 검색을 실행
 * - CTA 위에 추천도서 선정 기준 설명 고정 노출
 * description이 빈 책(정보나루에 소개 없음)은 소개 문단만 생략.
 */
export function SuggestionPopup({
  suggestion,
  theme,
  onClose,
  onSearch,
}: {
  suggestion: Suggestion;
  theme: "blue" | "green";
  onClose: () => void;
  onSearch: (title: string) => void;
}) {
  // 팝업이 떠 있는 동안 뒤 화면 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ctaClass =
    theme === "blue"
      ? "bg-blue-600 active:bg-blue-800"
      : "bg-green-600 active:bg-green-800";
  const labelClass = theme === "blue" ? "text-blue-600" : "text-green-600";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${suggestion.title} 소개`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-gray-400 active:text-gray-600"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex flex-col items-center pt-3">
          <img
            src={suggestion.coverUrl}
            alt={`${suggestion.title} 표지`}
            className="h-48 rounded-lg shadow-md object-contain bg-gray-100"
          />
          <span className={`mt-3 text-[11px] font-semibold ${labelClass}`}>
            {suggestion.popupLabel ?? LABEL_TEXT[suggestion.label]}
          </span>
          <h2 className="mt-0.5 text-base font-bold text-gray-900 text-center leading-snug">
            {suggestion.title}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {[suggestion.author, suggestion.publisher].filter(Boolean).join(" · ")}
          </p>
          {storyLine(suggestion) && (
            <p className="mt-1.5 text-[11px] font-medium text-gray-500 bg-gray-50 rounded-full px-3 py-1">
              {storyLine(suggestion)}
            </p>
          )}
        </div>

        {suggestion.description && (
          <p className="mt-4 text-sm text-gray-600 leading-relaxed">
            {suggestion.description}
          </p>
        )}

        <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400 leading-relaxed">
          추천도서는{" "}
          <a
            href="https://www.data4library.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            정보나루
          </a>
          의 서울 공공도서관 20·30대 대출 데이터를 바탕으로 매월 새로
          선정해요 — 전월대비 급상승한 책, 대출 순위가 높은 책, 인기 도서의
          독자들이 함께 빌린 책, 그리고 화제의 드라마·영화 원작까지.
        </p>

        <button
          type="button"
          onClick={() => onSearch(suggestion.title)}
          className={`mt-3 w-full py-3.5 rounded-xl text-white text-sm font-semibold ${ctaClass}`}
        >
          {theme === "blue" ? "전자책으로 찾아보시겠어요?" : "종이책으로 찾아보시겠어요?"}
        </button>
      </div>
    </div>
  );
}
