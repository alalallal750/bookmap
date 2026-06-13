import { notFound } from "next/navigation";
import Link from "next/link";
import { Availability, ApiResponse } from "@/types";
import { AvailabilityPanel } from "@/components/book/AvailabilityPanel";

type Props = {
  params: { isbn: string };
  searchParams: { title?: string };
};

async function getAvailability(isbn: string, title?: string): Promise<Availability | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = new URL(`${baseUrl}/api/availability`);
    url.searchParams.set("isbn", isbn);
    if (title) url.searchParams.set("title", title);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const json: ApiResponse<Availability> = await res.json();
    if (!json.success) return null;
    return json.data;
  } catch {
    return null;
  }
}

export default async function BookPage({ params, searchParams }: Props) {
  const { isbn } = params;
  const title = searchParams.title;
  if (!isbn) notFound();

  const availability = await getAvailability(isbn, title);

  const allLibraries = [
    ...(availability?.physical ?? []),
    ...(availability?.smartLibrary ?? []),
  ];
  const totalBooks = allLibraries.reduce((sum, l) => sum + ((l as any).totalCount ?? 1), 0);
  const availableBooks = allLibraries.reduce((sum, l) => sum + ((l as any).availableCount ?? (l.available ? 1 : 0)), 0);
  const availableCount = allLibraries.filter((l) => l.available).length;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-2 text-gray-500 active:text-gray-900"
            aria-label="뒤로가기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div>
            <p className="text-xs text-gray-400">ISBN {isbn}</p>
            <h1 className="font-bold text-gray-900">
              {title ?? "읽기 방법 확인"}
            </h1>
          </div>
        </div>
      </header>

      {availability && allLibraries.length > 0 && (
        <div
          className={`mx-4 mt-4 rounded-2xl p-4 ${
            availableCount > 0
              ? "bg-green-50 border border-green-100"
              : "bg-red-50 border border-red-100"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              availableCount > 0 ? "text-green-700" : "text-red-600"
            }`}
          >
            {availableCount > 0
              ? `지금 바로 빌릴 수 있는 책 ${availableBooks}권`
              : "현재 모든 시설에서 대출 중이에요"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">동작구 내 {availability?.physical.length ?? 0}개 도서관 · 총 {totalBooks}권 보유</p>
          
        </div>
      )}

      {availability ? (
        <div className="mt-4">
          <AvailabilityPanel isbn={isbn} availability={availability} />
        </div>
      ) : (
        <div className="px-4 py-16 text-center">
          <p className="text-gray-500 text-sm">소장 정보를 불러올 수 없습니다.</p>
          <Link href="/" className="text-green-600 text-sm mt-2 inline-block">
            다시 검색하기
          </Link>
        </div>
      )}
    </main>
  );
}
