// ─── 도서 ────────────────────────────────────────────────────
export type Book = {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  publishYear: number;
  coverImage?: string;
};

// ─── 도서관 유형 ──────────────────────────────────────────────
export type LibraryType = "library" | "small_library" | "smart_library" | "edu_library";

// ─── 물리 도서관 ──────────────────────────────────────────────
export type PhysicalLibrary = {
  id: string;
  libraryName: string;
  libraryType: LibraryType;
  address: string;
  latitude: number;
  longitude: number;
  tel?: string;
  openingHours?: string;
  homepageUrl?: string;
  searchResultUrl?: string; // 해당 도서 검색결과 링크
  // 런타임에 채워지는 필드
  available?: boolean;
  callNumber?: string; // 자료실명
  returnDueDate?: string; // 반납예정일 (대출불가 시)
  distance?: number; // km, 현재 위치 기준
  totalCount?: number;
  availableCount?: number;
  copyInfo?: string;
};

// ─── 전자책 제공처 (향후 확장) ────────────────────────────────
export type EbookProvider = {
  provider: string;
  url: string;
  searchable: boolean;
  loginRequired: boolean;
};

// ─── 서울도서관 통합검색 기반 전자책 ──────────────────────────
// 같은 도서관(dbnum) 1건 = 1개의 EbookLibraryEntry
export type EbookLibraryEntry = {
  dbnum: string;
  libraryName: string; // 예: "마포구립전자도서관"
  available: boolean;
  // [2026-06-20 v27 변경] 상세페이지 링크 → 도서관 검색창 결과 화면 링크로
  // 의미 변경. 벤더/매체가 갈라지는 경우(동대문구 등) 사용자가 검색결과에서
  // 직접 선택하도록 하기 위함. 검색어는 우리 화면에 표시된 책 제목.
  url: string;
  loanInfo?: string; // 원문 그대로 표시할 보조 문구 (예: "0/5", "대출가능")
  loanableCount?: number;
};

// 같은 책(제목+저자 일치)으로 묶인 카드 1건 = 여러 도서관을 포함
export type EbookBook = {
  title: string;
  author: string;
  publisher?: string;
  publishDate?: string; // Date 필드, 판본 묶기 보조용 + 화면 표시용
  coverImage?: string;
  libraries: EbookLibraryEntry[];
};

// ─── 전자책 검색 API 응답 ─────────────────────────────────────
export type EbookSearchResult = {
  books: EbookBook[];
  total: number;
};

// ─── 검색 종류 (서명 / 저자) ──────────────────────────────────
export type SearchCategory = "title" | "author";

// ─── 가용성 ──────────────────────────────────────────────────
export type Availability = {
  isbn: string;
  ebook: EbookProvider[];
  audiobook: EbookProvider[];
  physical: PhysicalLibrary[];
  smartLibrary: PhysicalLibrary[];
};
// ─── 종이책 (서울시 전체, ③④단계) ──────────────────────────────
export type PhysicalBook = {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishYear?: number;
  coverImage?: string;
  libraries: PhysicalLibrary[];
};
// ─── API 응답 래퍼 ────────────────────────────────────────────
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── 검색 API 응답 ────────────────────────────────────────────
export type SearchResult = {
  books: Book[];
  total: number;
};

// ─── types/index.ts에 "추가"할 내용 ─────────────────────────────
// (기존 EbookBook, EbookLibraryEntry 타입 근처에 추가하면 됨)

// 종이책(서울도서관 통합검색 기반) 책 1권(ISBN 기준) + 보유 분관별 목록
// EbookBook과 짝이 되는 타입 — 전자책은 도서관(dbnum) 단위, 종이책은
// 분관 단위로 더 잘게 나뉜다는 점이 다름.
export type PhysicalBook = {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishYear?: number;
  coverImage?: string;
  libraries: PhysicalLibrary[];
};

// 기존 PhysicalLibrary는 변경 없음 — 그대로 재사용.
// 종이책 검색에서 새로 채우는 필드: id, libraryName, libraryType("library"
// 고정), available, callNumber, searchResultUrl, returnDueDate.
// 비워두는 필드: address, latitude, longitude(분관 좌표 수집 전까지 0),
// tel, openingHours, homepageUrl, distance, totalCount, availableCount,
// copyInfo(종이책 통합검색 XML에 해당 정보 없음 — 동작구 dongjak.ts와 달리
// record 1건이 이미 분관 1건 단위라 별도 집계 불필요).