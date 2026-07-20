"use client";

import { useEffect } from "react";

/**
 * [2026-07-20 신규] 전국판 헤더 ⓘ 버튼으로 여는 이용 안내 팝업.
 * - 탭 시에만 열리고, 우상단 X 또는 딤 배경 탭으로 닫힘 (자동 노출 없음)
 * - 3·4단계의 미니 버튼은 지도 상세패널(LibraryDetail)의 확인하기(btn-primary)
 *   /길찾기(btn-secondary) 버튼과 같은 디자인을 축소한 장식용 복제 —
 *   실제 동작은 없으므로 pointer-events 차단.
 */
export function GuidePopup({ onClose }: { onClose: () => void }) {
  // 팝업이 떠 있는 동안 뒤 화면 스크롤 잠금 (SuggestionPopup 패턴)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <p className="text-base font-bold text-gray-900 leading-snug">
            어서오세요. 처음 오셨군요!
          </p>
          <button
            onClick={onClose}
            className="p-1 -mr-1 flex-shrink-0 text-gray-400 active:text-gray-600"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          읽고 싶은 책을 지금, 빌려서 바로 읽을 수 있는{" "}
          <span className="font-bold text-gray-800">지금빌려 Caniread</span> 입니다.
        </p>

        <ol className="space-y-3 mb-5">
          <GuideStep no={1}>책을 검색하고,</GuideStep>
          <GuideStep no={2}>가까운 도서관을 지도에서 확인하신 후,</GuideStep>
          <GuideStep no={3}>
            도서관 홈페이지에서 대출 가능 여부를 확인하시면,
            <MiniButton variant="primary">대출 가능한지 확인하기</MiniButton>
          </GuideStep>
          <GuideStep no={4}>
            해당 도서관으로 바로 길찾기를 해서 찾아갈 수 있어요.
            <MiniButton variant="secondary">길찾기</MiniButton>
          </GuideStep>
          <GuideStep no={5}>
            원하는 도서관의 책이 대출중이라면, 구별 도서관에 로그인 후 도서
            예약이나 상호대차를 신청할 수 있어요.
          </GuideStep>
        </ol>

        <div className="bg-gray-50 rounded-xl p-3.5 text-xs text-gray-500 leading-relaxed">
          카카오 지갑/네이버 전자문서에서{" "}
          <span className="font-bold text-gray-700">책이음 회원가입</span>을
          하시면, 전국 도서관에서 책을 빌리실 수 있어요. 일부 도서관은 최초
          1회 방문이 필요할 수 있어요.
        </div>
      </div>
    </div>
  );
}

function GuideStep({ no, children }: { no: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
        {no}
      </span>
      <div className="text-sm text-gray-600 leading-relaxed min-w-0">{children}</div>
    </li>
  );
}

/** LibraryDetail의 btn-primary/btn-secondary 디자인 축소판 (장식용) */
function MiniButton({
  variant,
  children,
}: {
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const style =
    variant === "primary"
      ? "bg-green-600 text-white"
      : "bg-white text-gray-700 border border-gray-200";
  return (
    <span
      aria-hidden
      className={`pointer-events-none select-none inline-block mt-1.5 ${style} font-semibold rounded-lg px-3 py-1.5 text-[11px] text-center`}
    >
      {children}
    </span>
  );
}
