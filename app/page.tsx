"use client";

/**
 * [2026-07-22 개편 — 진입 구조(핸드오프 v3 20장)] 루트(`/`)는 유일 진입점.
 * 진입 즉시 현재 위치로 서울/서울외를 갈라 라우팅한다(20-2, A안):
 *   - 서울           → /ebook       (A-B 랜딩: 전자책 → 하단 버튼으로 종이책 교차)
 *   - 서울 외        → /nationwide  (C: 전국 종이책)
 *   - 위치 없음/거부 → /ebook?loc=none (기본 A-B + 배너로 C 유도)
 *
 * 이전 버전은 검색 UI를 두고 무조건 /ebook으로 리다이렉트했으나, 단일 도메인
 * 원칙(점1)에 따라 루트는 분기 스플래시만 담당하도록 정리. 검색은 각 하위
 * 페이지(/ebook·/physical·/nationwide)가 담당한다.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  classifyByCoords,
  routeForClass,
  getPositionOnce,
} from "@/lib/entryLocation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coords = await getPositionOnce();
        if (cancelled) return;
        const cls = classifyByCoords(coords.latitude, coords.longitude);
        router.replace(routeForClass(cls));
      } catch {
        // 거부·타임아웃·미지원 — 전부 위치 없음으로 취급, A-B + 배너로.
        if (!cancelled) router.replace("/ebook?loc=none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <img
        src="/logo-main.png"
        alt="지금빌려 로고"
        className="w-56 mb-8"
        style={{ filter: "brightness(0.9)" }}
      />
      <div className="w-7 h-7 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-gray-400 text-sm">
        내 위치를 확인하고 있어요...
      </p>
      <p className="text-gray-300 text-xs mt-1">
        가까운 도서관 정보를 준비할게요.
      </p>
    </main>
  );
}
