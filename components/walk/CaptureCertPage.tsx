"use client";

/**
 * [2026-07-22 v3 — 책 산책 21-4] 표지 카드(화면캡처용). 표지를 <img>로 표시
 * (외부 CDN이어도 화면표시라 CORS 무관)하고, 선택한 템플릿의 조합·폰트·배치를
 * 타이포그래피로 얹는다. canvas 미사용 — 사용자가 스크린샷. 폭 고정(300px)으로
 * 타이포 비례 일정.
 */

import { WalkStampData } from "@/lib/walk/types";
import { StampTemplate, FONT_STACKS, DISPLAY_FONTS } from "@/lib/walk/stampTemplates";
import { buildStampLines, LINE_STYLE } from "@/lib/walk/stampLayout";

const BASE = 300;

export function CaptureCertPage({
  data,
  template,
  logoVariant = "icon",
  markColor = "#ffffff",
  textMode = "white",
}: {
  data: WalkStampData;
  template: StampTemplate;
  logoVariant?: "icon" | "wordmark";
  markColor?: string;
  textMode?: "white" | "black";
}) {
  const dark = textMode === "white"; // 흰 글자 = 어두운 카드
  const tone = (t: "hero" | "white" | "gray"): string => {
    if (t === "hero") return dark ? template.accent : "#141414";
    if (t === "white") return dark ? "#ffffff" : "#141414";
    return dark ? "rgba(255,255,255,0.8)" : "rgba(20,20,20,0.66)";
  };
  const cardBg = dark
    ? "linear-gradient(160deg,#134e4a 0%,#0b1120 100%)"
    : "linear-gradient(160deg,#f6f4ec 0%,#e7e2d4 100%)";
  const logoFilter = dark ? "brightness(0) invert(1)" : "brightness(0)";
  const lines = buildStampLines(data, template);
  const isCenter = template.pos === "bottomCenter" || template.pos === "center";
  const family = FONT_STACKS[template.font];
  const isDisplay = DISPLAY_FONTS.has(template.font);

  return (
    <div
      className="relative rounded-3xl overflow-hidden shadow-xl flex flex-col"
      style={{
        width: BASE,
        aspectRatio: "3 / 4",
        background: cardBg,
      }}
    >
      <div className="flex-1 flex items-center justify-center min-h-0 px-6 pt-7 pb-3">
        {data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.coverUrl}
            alt={`${data.bookTitle} 표지`}
            className="w-auto rounded-lg shadow-2xl"
            style={{ maxHeight: 190 }}
          />
        ) : (
          <div
            className="w-24 h-36 rounded-lg flex items-center justify-center text-xs"
            style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
          >
            표지 없음
          </div>
        )}
      </div>

      <div
        className="px-6 pb-6 flex flex-col"
        style={{ alignItems: isCenter ? "center" : "flex-start", textAlign: isCenter ? "center" : "left" }}
      >
        {lines.map((ln, i) => {
          const st = LINE_STYLE[ln.kind];
          const ratio = ln.kind === "hero" && template.hero === "book" ? 0.07 : st.size;
          const fontSize = Math.round(ratio * BASE);
          return (
            <span
              key={i}
              style={{
                fontFamily: family,
                fontSize,
                fontWeight: isDisplay ? 400 : st.weight,
                color: tone(st.tone),
                lineHeight: ln.kind === "hero" ? 1.05 : 1.3,
                marginTop: ln.kind === "sig" ? 8 : 0,
                letterSpacing: ln.kind === "hero" ? "-0.02em" : undefined,
                maxWidth: BASE - 48,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ln.text}
            </span>
          );
        })}
      </div>

      {/* 우하단 서명 마크(고정·편집 불가) — 텍스트만 20%↓, 로고 이미지 유지 */}
      <div className="absolute right-4 bottom-3.5 flex items-center gap-1" style={{ opacity: 0.92 }}>
        <span style={{ fontSize: 9, color: markColor, fontFamily: FONT_STACKS.sans }}>
          오늘도 책 산책 with{logoVariant === "icon" ? " 지금빌려" : ""}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoVariant === "icon" ? "/walk-logo-icon.png" : "/walk-logo-wordmark.png"}
          alt="지금빌려"
          style={{
            height: logoVariant === "icon" ? 15 : 13,
            filter: logoFilter,
            marginLeft: logoVariant === "wordmark" ? -3 : 0, // 워드마크 좌측 투명 패딩 보정
          }}
        />
      </div>
    </div>
  );
}
