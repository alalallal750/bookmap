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
export type LibraryType = "library" | "small_library" | "smart_library";

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
