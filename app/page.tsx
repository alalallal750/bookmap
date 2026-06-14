"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Book, ApiResponse, SearchResult } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";
import { BookList } from "@/components/search/BookList";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; books: Book[]; query: string }
  | { status: "error"; message: string };

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const json: ApiResponse<SearchResult> = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ status: "done", books: json.data.books, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: Book) {
    // 책 선택 시 바로 지도 페이지로 이동
    router.push(`/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <img src="/logo-header.png" alt="지금빌려" className="h-10" />
          <p className="text-xs text-gray-400">그 책, 지금 어디서 빌릴 수 있지?</p>
        </div>
        <SearchBar
          onSearch={handleSearch}
          loading={state.status === "loading"}
        />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <img src="/logo-main.png" alt="지금빌려 로고" className="w-48 mb-6" />
            <p className="text-gray-500 text-base font-medium mb-1">
              읽고 싶은 책을 검색하세요
            </p>
            <p className="text-gray-400 text-sm mb-4">
              나랑 가까운 도서관에서 지금 빌릴 수 있는지 바로 확인해 드려요.
            </p>
            <div className="mt-10" />
            <p className="text-gray-300 text-xs leading-relaxed">
              현재는 동작구 도서관만 지원해요.<br />
              실제 대출가능 여부는 도서관 홈페이지에서 다시 한번 확인해 주세요.
            </p>
          </div>
        )}

        {state.status === "loading" && (
          <LoadingSpinner message="도서관에서 검색 중..." />
        )}

        {state.status === "error" && (
          <div className="px-4 py-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}

        {state.status === "done" && (
          <BookList
            books={state.books}
            onSelect={handleSelectBook}
            query={state.query}
          />
        )}
      </div>
    </main>
  );
}
