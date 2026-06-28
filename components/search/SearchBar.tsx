"use client";

import { useState, useRef, useEffect } from "react";

type SearchBarProps = {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
};
export function SearchBar({
  onSearch,
  loading = false,
  placeholder = "그 책, 제목이 뭐였지?",
}: SearchBarProps) {

  // [2026-06-21] 자동 포커스(autoFocus)를 모바일에서 끄기 위한 화면 너비 판단.
  // 모바일에서 자동 포커스 시 키보드가 즉시 올라와 로고/안내문구를 가려버리는
  // 문제 발견(실기기 확인). 480px 이상(PC/태블릿)에서만 자동 포커스 적용.
  const [value, setValue] = useState("");
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShouldAutoFocus(window.innerWidth >= 480);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || loading) return;
    onSearch(q);
  }

  function handleClear() {
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center">
        {/* 검색 아이콘 */}
        <span className="absolute left-4 text-gray-400 pointer-events-none">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={shouldAutoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="w-full pl-11 pr-24 py-3.5 rounded-2xl border border-gray-200
            bg-white text-base text-gray-900 placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
            disabled:opacity-60 shadow-sm"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* 지우기 버튼 */}
        {value && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-16 p-1 text-gray-400 hover:text-gray-600"
            aria-label="검색어 지우기"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" fill="#d1d5db" />
              <path d="M6 6l6 6M12 6l-6 6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* 검색 버튼 */}
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="absolute right-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold
            rounded-xl disabled:opacity-40 transition-colors active:bg-green-800"
        >
          {loading ? "검색중" : "검색"}
        </button>
      </div>
    </form>
  );
}
