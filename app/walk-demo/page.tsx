"use client";

/**
 * [2026-07-22 임시 데모 하네스 — 책 산책 21장] StampEditor(방식1·3)를 샘플
 * 산책 데이터로 렌더해 확인하기 위한 페이지. 실제 도착 인증 플로우(마커 상세
 * → 출발 스탬프 → 앱 복귀 어포던스)에 배선되면 이 라우트는 제거/대체 예정.
 */

import { useState } from "react";
import { StampEditor, LogoVariant } from "@/components/walk/StampEditor";
import { WalkStampData } from "@/lib/walk/types";

const SAMPLE: WalkStampData = {
  bookTitle: "첫 여름, 완주",
  bookAuthor: "김금희",
  coverUrl: "https://image.aladin.co.kr/product/36275/58/cover500/k692038832_1.jpg",
  libraryName: "사당솔밭도서관",
  arrivedAt: new Date(),
  distanceKm: 1.0,
  steps: 8000,
  walkCount: 3,
};

export default function WalkDemoPage() {
  const [logo, setLogo] = useState<LogoVariant>("wordmark");
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-lg font-bold text-gray-800 mb-1">책 산책 · 도착 인증 (데모)</h1>
        <p className="text-xs text-gray-400 mb-3">
          우하단 서명 로고 비교 — favicon(아이콘) vs 1번(워드마크). 우하단 고정.
        </p>
        {/* 임시: 로고 버전 비교 토글 */}
        <div className="flex gap-1.5 mb-5">
          <button
            onClick={() => setLogo("icon")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              logo === "icon" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            favicon 버전
          </button>
          <button
            onClick={() => setLogo("wordmark")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              logo === "wordmark" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            1번(지금빌려) 버전
          </button>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
          <StampEditor data={SAMPLE} logoVariant={logo} />
        </div>
      </div>
    </main>
  );
}
