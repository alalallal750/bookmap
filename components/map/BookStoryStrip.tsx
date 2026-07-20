"use client";

import { findSuggestionByIsbn, type Suggestion } from "@/lib/data/suggestions";

// [2026-07-20 신규] 지도 페이지 헤더 밑 대출 스토리텔링 한 줄.
// 추천 도서 10권(판본 matchIsbns 포함)에 ISBN 완전일치할 때만 렌더 —
// 그 외 검색 도서는 정보나루 추가 호출 없이 조용히 생략 (호출 절약 원칙).
// 문구 우선순위: 그룹 1~3위 > 전국 순위(50위 이내만) > 대출 건수(300회 이상만)
// > 라벨 문장(원작·마니아 등). 어떤 경우든 추천 도서면 한 줄은 나온다.

const FALLBACK_TEXT: Record<Suggestion["label"], string> = {
  hot: "서울 20·30대 대출이 전월대비 급상승한 책이에요",
  popular: "서울 20·30대가 많이 빌리는 책이에요",
  mania: "인기 도서의 독자들이 함께 많이 빌린 책이에요",
  media: "화제의 드라마 원작 소설이에요",
};

function storyText(s: Suggestion): string {
  const st = s.story;
  if (st) {
    const monthNum = parseInt(st.month.split("-")[1] ?? "", 10);
    const m = Number.isFinite(monthNum) ? `${monthNum}월` : "지난달";
    if (st.topGroup) {
      const grp =
        st.topGroupRank === 1
          ? `${st.topGroup}이 가장 많이 빌린 책이에요`
          : `${st.topGroup} 대출 ${st.topGroupRank}위예요`;
      return st.lastMonthRank
        ? `${m} 전국 대출 ${st.lastMonthRank}위 · ${grp}`
        : `${m} 전국 도서관에서 ${grp.replace("예요", "인 책이에요")}`;
    }
    if (st.lastMonthRank)
      return `${m} 전국 도서관 대출 ${st.lastMonthRank}위에 오른 책이에요`;
    if (st.lastMonthLoanCnt && st.lastMonthLoanCnt >= 300)
      return `${m} 전국 도서관에서 ${st.lastMonthLoanCnt.toLocaleString()}회 대출된 책이에요`;
  }
  return s.popupLabel ?? FALLBACK_TEXT[s.label];
}

export function BookStoryStrip({ isbn }: { isbn: string }) {
  const suggestion = findSuggestionByIsbn(isbn);
  if (!suggestion) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5">
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        className="flex-shrink-0 text-emerald-500"
        aria-hidden
      >
        <path
          d="M3 13l5-5 3 3 6-7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 4h4v4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-[11px] text-emerald-700 leading-snug line-clamp-1">
        {storyText(suggestion)}
      </p>
    </div>
  );
}
