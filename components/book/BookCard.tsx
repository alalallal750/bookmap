import Image from "next/image";
import { Book } from "@/types";

type BookCardProps = {
  book: Book;
  onSelect: (book: Book) => void;
};

export function BookCard({ book, onSelect }: BookCardProps) {
  return (
    <button
      onClick={() => onSelect(book)}
      className="w-full flex items-start gap-3 p-4 bg-white rounded-2xl
        border border-gray-100 shadow-sm text-left
        active:bg-gray-50 transition-colors"
    >
      {/* 표지 */}
      <div className="flex-shrink-0 w-14 h-20 bg-gray-100 rounded-lg overflow-hidden relative">
        {book.coverImage ? (
          <Image
            src={book.coverImage}
            alt={`${book.title} 표지`}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-300">
              <rect x="3" y="2" width="18" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 7h10M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
          {book.title}
        </p>
        <p className="text-xs text-gray-500 truncate">{book.author}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {book.publisher}
          {book.publishYear > 0 && ` · ${book.publishYear}`}
        </p>
        <p className="text-[11px] text-gray-300 mt-1">ISBN {book.isbn}</p>
      </div>

      {/* 화살표 */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-shrink-0 text-gray-300 mt-1"
      >
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
