import Link from "next/link";
import { PhysicalLibrary } from "@/types";

type PhysicalSectionProps = {
  isbn: string;
  physical: PhysicalLibrary[];
  smartLibrary: PhysicalLibrary[];
  title?: string;
};

export function PhysicalSection({ isbn, physical, smartLibrary, title }: PhysicalSectionProps) {
  const all = [...physical, ...smartLibrary];

  // 권수 기준 집계
  const totalBooks = all.reduce((sum, l) => sum + (l.totalCount ?? 1), 0);
  const availableBooks = all.reduce((sum, l) => sum + (l.availableCount ?? (l.available ? 1 : 0)), 0);
  const facilityCount = all.length;

  const mapHref = `/map/${isbn}${title ? `?title=${encodeURIComponent(title)}` : ""}`;

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">📚</span>
        <h2 className="font-bold text-gray-900 text-base">종이책</h2>
      </div>

      {all.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-gray-500 text-sm">동작구 내 소장 도서관을 찾지 못했습니다</p>
        </div>
      ) : (
        <>
          <div className="card p-4 mb-4">
            <p className="text-sm text-gray-600 mb-1">
              동작구 내{" "}
              <span className="font-bold text-gray-900">{facilityCount}개</span>{" "}
              도서관 ·{" "}
              <span className="font-bold text-gray-900">{totalBooks}권</span>{" "}
              보유
            </p>
            {availableBooks > 0 ? (
              <p className="text-sm text-green-600 font-semibold">
                지금 바로 대출 가능한 책 {availableBooks}권
              </p>
            ) : (
              <p className="text-sm text-red-500">현재 모든 책이 대출 중</p>
            )}
          </div>

          <Link href={mapHref} className="btn-primary block">
            지도에서 보기
          </Link>
        </>
      )}
    </div>
  );
}
