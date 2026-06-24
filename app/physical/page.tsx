"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhysicalBook, ApiResponse } from "@/types";
import { SearchBar } from "@/components/search/SearchBar";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; books: PhysicalBook[]; query: string }
  | { status: "error"; message: string };

export default function PhysicalSearchPage() {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function handleSearch(query: string) {
    setState({ status: "loading" });
    try {
      const url = new URL("/api/physical-search", window.location.origin);
      url.searchParams.set("q", query);

      // 위치 권한이 있으면 함께 보내되, 없거나 실패해도 검색은 계속 진행
      // (API가 못 받으면 DEFAULT_LOCATION으로 처리함)
      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("위치 미지원"));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
          );
        });
        url.searchParams.set("lat", String(coords.latitude));
        url.searchParams.set("lng", String(coords.longitude));
      } catch {
        // 위치 못 가져와도 검색은 진행 (DEFAULT_LOCATION으로 처리됨)
      }

      const res = await fetch(url.toString());
      const json: ApiResponse<PhysicalBook[]> = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ status: "done", books: json.data, query });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleSelectBook(book: PhysicalBook) {
    router.push(`/physical/map/${book.isbn}?title=${encodeURIComponent(book.title)}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <img src="/logo-header.png" alt="지금빌려" className="h-10" />
          <p className="text-xs text-gray-400">그 책, 지금 어디서 빌릴 수 있지?</p>
        </div>
        <SearchBar onSearch={handleSearch} loading={state.status === "loading"} />
      </header>

      <div className="flex-1 py-4">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <img
              src="/logo-main.png"
              alt="지금빌려 로고"
              className="w-64 mb-6"
              style={{ filter: "brightness(0.9)" }}
            />
            <p className="text-gray-500 text-base font-medium mb-1">
              읽고 싶은 책을 검색하세요
            </p>
            <p className="text-gray-400 text-sm mb-4">
              나랑 가까운 도서관에서 지금 빌릴 수 있는지 바로 확인해 드려요.
            </p>
            <div className="mt-10" />
            <p className="text-gray-300 text-xs leading-relaxed">
              서울시 전체 도서관 정보를 보여드려요.
              <br />
              실제 대출가능 여부는 도서관 홈페이지에서 다시 한번 확인해 주세요.
            </p>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">검색 중...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        )}

        {state.status === "done" && (
          <div className="px-4">
            {state.books.length === 0 ? (
              <p className="text-gray-400 text-sm text-center pt-16">
                검색 결과가 없어요. 다른 제목으로 검색해보세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.books.map((book) => {
                  const availableCount = book.libraries.filter((l) => l.available).length;
                  return (
                    <li key={book.isbn}>
                      <button
                        onClick={() => handleSelectBook(book)}
                        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm active:bg-gray-50"
                      >
                        <p className="font-bold text-gray-900 text-sm line-clamp-1">
                          {book.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {book.author}
                          {book.publisher ? ` · ${book.publisher}` : ""}
                          {book.publishYear ? ` · ${book.publishYear}` : ""}
                        </p>
                        <p
                          className={`text-xs mt-1.5 font-semibold ${
                            availableCount > 0 ? "text-green-600" : "text-gray-400"
                          }`}
                        >
                          {book.libraries.length}개 도서관 소장
                          {availableCount > 0 ? ` · ${availableCount}곳 대출가능` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}