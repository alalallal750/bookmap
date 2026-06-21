"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiResponse, EbookBook, EbookLibraryEntry, EbookSearchResult } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; books: EbookBook[]; query: string }
  | { status: "error"; message: string };

export default function EbookSearchPage() {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const url = `/api/ebook-search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const json: ApiResponse<EbookSearchResult> = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ status: "done", books: json.data.books, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  // [2026-06-21 변경] 종이책 검색은 아직 이 서비스 안에 구현되어 있지 않아,
  // 이미 동작구 종이책 검색을 지원하는 기존 운영 MVP(caniread.vercel.app)로
  // 사용자를 보냄. 같은 앱 내부 이동이 아니라 다른 도메인으로 가는 것이라
  // router.push 대신 window.location.href 사용. 검색어가 있으면(이미 검색을
  // 마친 done 상태) 그대로 넘겨주고, 없으면(idle 상태) 빈 화면으로 보냄.
  function goToPhysicalSearch() {
    const query = state.status === "done" ? state.query : "";
    const target = query
      ? `https://caniread.vercel.app/?q=${encodeURIComponent(query)}`
      : `https://caniread.vercel.app/`;
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        {/* [2026-06-21] 480px 미만에서는 로고/문구 세로 배치, 480px 이상에서
            가로 배치(min-[480px]: 임의값 사용). 로고는 w-auto+flex-shrink-0으로
            늘어나거나 찌그러지지 않게 고정. */}
        <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-1 min-[480px]:gap-3 mb-3">
          <img src="/logo-header.png" alt="지금빌려" className="h-10 w-auto flex-shrink-0" />
          <p className="text-xs text-gray-400">
            지금 바로 읽을 수 있는 전자책이 있는지 검색할게요.
            <br />
            전자책을 읽으시려면 각 도서관 사이트에 먼저 가입하셔야 해요.
          </p>
        </div>

        <SearchBar
          onSearch={handleSearch}
          loading={state.status === "loading"}
          placeholder="그 책, 제목이 뭐였더라?"
        />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <>
            <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
              <img src="/logo-main.png" alt="지금빌려 로고" className="w-64 mb-6" style={{ filter: "brightness(0.9)" }} />
              <p className="text-gray-500 text-base font-medium mb-1">
                읽고 싶은 책을 검색하세요
              </p>
              <p className="text-gray-400 text-sm mb-4">
                전자책으로 바로 읽을 수 있는지 먼저 확인해 드려요.
              </p>
            </div>

            {/* 전자책을 원하지 않는 사용자를 검색 전에 바로 종이책으로 안내하는
                버튼. 화면 스크롤 위치와 무관하게 항상 화면 하단에 고정되도록
                fixed 사용 (2026-06-21 논의: idle 화면은 콘텐츠가 짧아 거의
                항상 화면 맨 아래와 같은 자리에 보이지만, 작은 화면이나 향후
                콘텐츠 추가에도 안전하게 보이도록 고정 방식 선택). */}
            <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-100">
              <button
                onClick={goToPhysicalSearch}
                className="w-full py-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium"
              >
                종이책으로 찾아보시겠어요?
              </button>
            </div>
          </>
        )}

        {state.status === "loading" && (
          <LoadingSpinner message="전자도서관에서 검색 중..." />
        )}

        {state.status === "error" && (
          <div className="px-4 py-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}

        {state.status === "done" && (
          <>
            {state.books.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-gray-400 text-sm">
                  &quot;{state.query}&quot;에 대한 전자책 검색 결과가 없어요.
                </p>
              </div>
            ) : (
              <div className="px-4 space-y-3">
                {state.books.map((book, i) => (
                  <EbookCard key={`${book.title}-${i}`} book={book} />
                ))}
              </div>
            )}

            {/* 종이책으로 찾아보시겠어요 버튼 - 상시 노출 (handoff 1-3장) */}
            <div className="px-4 mt-6">
              <button
                onClick={goToPhysicalSearch}
                className="w-full py-3.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium"
              >
                종이책으로 찾아보시겠어요?
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function EbookCard({ book }: { book: EbookBook }) {
  const hasCover = Boolean(book.coverImage);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex gap-3">
        {/* [2026-06-20 v20 수정] 표지 이미지가 없을 때 대체로 보여주는 favicon은
            책 표지처럼 꽉 채워서 늘리면 어색해 보여서(원래 정사각형 아이콘이라),
            75% 크기로 줄이고 칸 가운데에 배치하기로 함(지난 세션 논의, 지금까지
            반영이 안 되어 있었음). 표지 이미지가 있을 때는 기존처럼 칸을 꽉
            채워서 보여줌 — 이 경우엔 줄일 필요가 없음. */}
        <div className="w-14 h-20 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
          <img
            src={book.coverImage || "/favicon.png"}
            alt={book.title}
            className={
              hasCover
                ? "w-full h-full object-cover"
                : "w-[75%] h-[75%] object-contain"
            }
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
            {book.title}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {[book.author, book.publisher].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {book.libraries.map((lib) => (
          <a
            key={lib.dbnum}
            href={lib.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-xs"
          >
            <span className="text-gray-600">{lib.libraryName}</span>
            <span
              className="font-medium"
              style={{ color: lib.available ? "#16a34a" : "#9ca3af" }}
            >
              {getDisplayStatus(lib)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * [2026-06-19 v2] 도서관별 대출가능 표시 형식 통일 — loanableCount(정확한 권수)
 * 기반으로 재정리.
 *
 * 규칙:
 *   1. 권수를 알고(loanableCount 존재) 1권 이상 빌릴 수 있으면 → "N권 대출가능"
 *   2. 권수를 알지만 0권이면 → "모두 대출중"
 *   3. 권수를 모르고("사이트 확인" 안내가 있는 도서관, 예: 서울시 전자도서관) →
 *      안내문구 그대로
 *   4. (예외 대비) 권수도 모르고 안내문구도 없는 경우 → available만 보고
 *      "대출가능"/"대출중"으로 폴백
 *
 * 소장 전체 권수("N권 대출가능 / M권 소장")는 일부러 보여주지 않음 — 사용자가
 * 실제로 필요한 정보는 "지금 빌릴 수 있는가"이고, 전체 권수는 핵심 의사결정에
 * 불필요한 정보라 화면을 더 간결하게 유지하기로 함(2026-06-19 논의).
 */
function getDisplayStatus(lib: EbookLibraryEntry): string {
  if (typeof lib.loanableCount === "number") {
    return lib.loanableCount > 0 ? `${lib.loanableCount}권 대출가능` : "모두 대출중";
  }
  if (lib.loanInfo?.includes("사이트 확인")) return lib.loanInfo;
  return lib.available ? "대출가능" : "대출중";
}