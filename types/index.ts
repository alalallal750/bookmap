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
  url: string; // 해당 도서관 상세페이지 링크
  loanInfo?: string; // 원문 그대로 표시할 보조 문구 (예: "0/5", "대출가능")
  // [2026-06-19 추가] 지금 빌릴 수 있는 정확한 권수(숫자). 화면에서 "N권
  // 대출가능" 형태로 통일된 표시를 만들기 위해 사용. 권수를 알 수 없는
  // 도서관(예: 서울시 전자도서관 — 로그인 필요)은 undefined로 둠 — 이 경우
  // loanInfo의 안내문구를 그대로 보여줘야 함.
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

// ─── API 응답 래퍼 ────────────────────────────────────────────
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── 검색 API 응답 ────────────────────────────────────────────
export type SearchResult = {
  books: Book[];
  total: number;
};