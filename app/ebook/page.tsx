"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiResponse, EbookBook, EbookSearchResult, SearchCategory } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; books: EbookBook[]; query: string }
  | { status: "error"; message: string };

export default function EbookSearchPage() {
  const router = useRouter();
  const [category, setCategory] = useState<SearchCategory>("title");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const url = `/api/ebook-search?q=${encodeURIComponent(query)}&category=${category}`;
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

  function goToPhysicalSearch() {
    const query = state.status === "done" ? state.query : "";
    router.push(`/?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <img src="/logo-header.png" alt="지금빌려" className="h-10" />
          <p className="text-xs text-gray-400">전자책으로 먼저 읽을 수 있는지 확인해보세요</p>
        </div>

        {/* 서명/저자 탭 */}
        <div className="flex gap-2 mb-3">
          {(["title", "author"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={{
                background: category === c ? "#16a34a" : "#f3f4f6",
                color: category === c ? "white" : "#6b7280",
              }}
            >
              {c === "title" ? "서명" : "저자"}
            </button>
          ))}
        </div>

        <SearchBar
          onSearch={handleSearch}
          loading={state.status === "loading"}
          placeholder={category === "title" ? "책 제목을 입력하세요" : "저자명을 입력하세요"}
        />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <img src="/logo-main.png" alt="지금빌려 로고" className="w-64 mb-6" style={{ filter: "brightness(0.9)" }} />
            <p className="text-gray-500 text-base font-medium mb-1">
              읽고 싶은 책을 검색하세요
            </p>
            <p className="text-gray-400 text-sm mb-4">
              전자책으로 바로 읽을 수 있는지 먼저 확인해 드려요.
            </p>
          </div>
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
  const hasAvailable = book.libraries.some((l) => l.available);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex gap-3">
        {book.coverImage && (
          <img
            src={book.coverImage}
            alt={book.title}
            className="w-14 h-20 object-cover rounded-lg flex-shrink-0 bg-gray-100"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
            {book.title}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {[book.author, book.publisher].filter(Boolean).join(" · ")}
          </p>
        </div>
        {hasAvailable && (
          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-medium h-fit">
            대출가능
          </span>
        )}
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
              {lib.available ? "대출가능" : lib.loanInfo || "대출중"}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
