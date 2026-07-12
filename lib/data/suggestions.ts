// 검색창 밑 추천 칩용 도서 목록 — 정보나루(data4library) 서울 20·30대 대출 데이터 기반.
// 월 1회 수동 갱신: "지금빌려 claude code" 작업 폴더의 fetch_suggestions.mjs 실행 →
// 결과(suggestions_candidates.md)에서 전자책 소장 여부 확인 후 이 배열 교체.
export type Suggestion = {
  title: string;
  isbn13: string;
  label: "hot" | "popular";
};

export const suggestions: Suggestion[] = [
  { title: "첫 여름, 완주", isbn13: "9791197221989", label: "hot" },
  { title: "연매장", isbn13: "9791141609962", label: "hot" },
  { title: "아무도 오지 않는 곳에서", isbn13: "9791193078709", label: "hot" },
  { title: "홍학의 자리", isbn13: "9788954681155", label: "popular" },
  { title: "혼모노", isbn13: "9788936439743", label: "popular" },
];
