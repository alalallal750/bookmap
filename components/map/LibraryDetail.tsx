"use client";

import { PhysicalLibrary } from "@/types";
import { AvailableBadge } from "@/components/ui/Badge";
import { formatDistance } from "@/lib/distance";

type LibraryDetailProps = {
  library: PhysicalLibrary | null;
  bookTitle?: string;
  onClose: () => void;
};

export function LibraryDetail({ library, bookTitle, onClose }: LibraryDetailProps) {
  if (!library) return null;

  function openKakaoNavi() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const webUrl = `https://map.kakao.com/link/to/${encodeURIComponent(library!.libraryName)},${library!.latitude},${library!.longitude}`;

    if (isMobile) {
      // 모바일: 앱 시도 후 1.5초 뒤 웹 fallback
      window.location.href = `kakaomap://route?ep=${library!.latitude},${library!.longitude}&by=FOOT`;
      setTimeout(() => {
        window.open(webUrl, "_blank");
      }, 1500);
    } else {
      // PC: 바로 카카오맵 웹으로
      window.open(webUrl, "_blank");
    }
  }

  function openHomepage() {
    if (library?.searchResultUrl) {
      window.open(library.searchResultUrl, "_blank");
    } else if (library?.homepageUrl) {
      window.open(library.homepageUrl, "_blank");
    }
  }

  const typeLabel = {
    library: "구립도서관",
    small_library: "작은도서관",
    smart_library: "스마트도서관",
    edu_library: "교육청도서관",
  }

  return (
    <>
      {/* 딤 배경 */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* 패널 */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl
        max-h-[75vh] overflow-y-auto overscroll-contain
        pb-safe">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-6">
          {/* 헤더 */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {typeLabel[library.libraryType]}
                </span>
                {library.available !== undefined && (
                  <AvailableBadge available={library.available} />
                )}
              </div>
              <h2 className="font-bold text-gray-900 text-lg leading-tight">
                {library.libraryName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 active:text-gray-600"
              aria-label="닫기"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 도서 정보 */}
          {bookTitle && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-400 mb-0.5">검색한 도서</p>
              <p className="text-sm font-medium text-gray-800 line-clamp-1">{bookTitle}</p>
              {library.callNumber && (
                <p className="text-xs text-gray-500 mt-0.5">자료실: {library.callNumber}</p>
              )}
              {!library.available && library.returnDueDate && (
                <p className="text-xs text-red-500 mt-0.5">
                  반납예정: {library.returnDueDate}
                </p>
              )}
            </div>
          )}

          {/* 상세 정보 */}
          <div className="space-y-3 mb-5">
            {library.distance !== undefined && (
              <InfoRow
                icon="📍"
                label="거리"
                value={formatDistance(library.distance)}
              />
            )}
            <InfoRow icon="🏠" label="주소" value={library.address} />
            {library.openingHours && (
              <InfoRow icon="🕐" label="운영시간" value={library.openingHours} />
            )}
            {library.tel && (
              <a href={`tel:${library.tel}`}>
                <InfoRow icon="📞" label="전화" value={library.tel} clickable />
              </a>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="space-y-2">
            <button onClick={openKakaoNavi} className="btn-primary">
              길찾기
            </button>
            {library?.id?.startsWith("smart_") ? (
  <button
    onClick={() => {
      const SMART_NO: Record<string, string> = {
        smart_jangseungbaegi: "3",
        smart_sindaebang: "1",
        smart_isu: "2",
        smart_nodeul: "4",
        smart_kkamangdol: "5",
        smart_gymnasium: "6",
      };
      const titlePreview = bookTitle ? bookTitle.slice(0, 10) : "";
      if (library.id === "smart_EDU") {
        window.open("https://djlib.sen.go.kr/djlib/module/unmannedReservation/search.do?menu_idx=130&locExquery=111013", "_blank");
      } else {
        const no = SMART_NO[library.id];
        if (no) window.open(`http://smartlib.dongjak.go.kr:8088/EZ-950SL_Web/mainPage/SI_searchbookindex_Service.jsp?no=${no}`, "_blank");
      }
    }}
    className="btn-secondary"
  >
    {bookTitle ? `'${bookTitle.slice(0, 10)}' 스마트도서관에서 검색하기` : "스마트도서관에서 검색하기"}
  </button>
) : (
  <button onClick={openHomepage} className="btn-secondary">
    도서관 홈페이지에서 보기
  </button>
)}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
  clickable,
}: {
  icon: string;
  label: string;
  value: string;
  clickable?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${clickable ? "text-blue-600" : "text-gray-700"}`}>
      <span className="text-base flex-shrink-0 w-5">{icon}</span>
      <div>
        <span className="text-xs text-gray-400 block">{label}</span>
        <span className="text-sm">{value}</span>
      </div>
    </div>
  );
}
