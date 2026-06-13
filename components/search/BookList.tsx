import { Book } from "@/types";
import { BookCard } from "@/components/book/BookCard";

type BookListProps = {
  books: Book[];
  onSelect: (book: Book) => void;
  query: string;
};

export function BookList({ books, onSelect, query }: BookListProps) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-gray-200 mb-4">
          <rect x="6" y="4" width="36" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M14 16h20M14 22h20M14 28h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-gray-500 font-medium mb-1">검색 결과가 없습니다</p>
        <p className="text-gray-400 text-sm">
          <span className="font-medium text-gray-600">"{query}"</span>를 동작구 도서관에서 찾을 수 없어요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4">
      <p className="text-xs text-gray-400 mb-3">
        <span className="font-medium text-gray-600">"{query}"</span> 검색 결과{" "}
        {books.length}건
      </p>
      {books.map((book) => (
        <BookCard key={book.isbn} book={book} onSelect={onSelect} />
      ))}
    </div>
  );
}
