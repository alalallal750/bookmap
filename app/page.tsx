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
        <div className="mb-3">
          <h1 className="text-xl font-bold text-gray-900">BookMap</h1>
          <p className="text-xs text-gray-400">동작구 도서관에서 책 빠르게 찾기</p>
        </div>
        <SearchBar
          onSearch={handleSearch}
          loading={state.status === "loading"}
        />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <span className="text-6xl mb-4">📖</span>
            <p className="text-gray-500 text-base font-medium mb-1">
              읽고 싶은 책을 검색하세요
            </p>
            <p className="text-gray-400 text-sm">
              동작구 도서관에서 지금 빌릴 수 있는지 바로 확인해 드려요
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
