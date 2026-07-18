"use client";

/**
 * [2026-07-18 신규 — 전국판] 위치 없는 사용자의 시도 선택 지도.
 *
 * 경계 데이터는 Natural Earth(퍼블릭 도메인)를 단순화한 정적 SVG path
 * (lib/data/koreaRegionPaths.ts — 생성 파일). 도(9곳)는 면을 직접 탭,
 * 면적이 작은 광역시·세종은 원형 버튼으로 띄워 탭 타깃을 확보한다.
 */

import { useState } from "react";
import { KOREA_MAP_VIEWBOX, KOREA_REGION_SHAPES } from "@/lib/data/koreaRegionPaths";

// 라벨·원형 버튼 위치 수동 보정 (bbox 중심이 어색한 곳만, viewBox 좌표계)
const NUDGE: Record<string, [number, number]> = {
  "23": [-16, 8], // 인천 — 서울 원과 겹침 방지
  "25": [10, 8], // 대전 — 세종 원과 간격
  "29": [-18, -8], // 세종 — 대전 원과 간격
  "21": [-2, 10], // 부산 — 울산 원과 간격
  "26": [6, -12], // 울산 — 부산 원과 간격
  "31": [16, 18], // 경기 — bbox 중심이 서울 위라 남동쪽으로
  "34": [-14, 18], // 충남 — bbox 중심이 세종 원 자리라 남서쪽으로
  "36": [30, 6], // 전남 — 다도해 bbox 보정 + 광주 원 회피
  "37": [-12, 10], // 경북 — 울릉도·독도 포함 bbox 보정
  "39": [0, 8], // 제주 — 라벨을 섬 위로
};

const DO_REGIONS = KOREA_REGION_SHAPES.filter((s) => !s.metro);
const METRO_REGIONS = KOREA_REGION_SHAPES.filter((s) => s.metro);

function pos(s: { region: string; labelX: number; labelY: number }): [number, number] {
  const [dx, dy] = NUDGE[s.region] ?? [0, 0];
  return [s.labelX + dx, s.labelY + dy];
}

export function KoreaRegionMap({ onSelect }: { onSelect: (region: string) => void }) {
  const [pressed, setPressed] = useState<string | null>(null);

  return (
    <svg
      viewBox={KOREA_MAP_VIEWBOX}
      className="w-full h-auto select-none"
      role="group"
      aria-label="지역 선택 지도"
    >
      {/* 도 면 — 직접 탭 */}
      {DO_REGIONS.map((s) => (
        <path
          key={s.region}
          d={s.d}
          fill={pressed === s.region ? "#a7f3d0" : "#ecfdf5"}
          stroke="#6ee7b7"
          strokeWidth={1}
          className="cursor-pointer"
          role="button"
          aria-label={s.name}
          onPointerDown={() => setPressed(s.region)}
          onPointerUp={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)}
          onClick={() => onSelect(s.region)}
        />
      ))}
      {/* 광역시 면(작아서 탭은 원 버튼으로) — 시각 표시만 */}
      {METRO_REGIONS.map((s) => (
        <path key={`m-${s.region}`} d={s.d} fill="#d1fae5" stroke="#6ee7b7" strokeWidth={0.8} />
      ))}
      {/* 도 라벨 */}
      {DO_REGIONS.map((s) => {
        const [x, y] = pos(s);
        return (
          <text
            key={`t-${s.region}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={15}
            fontWeight={700}
            fill="#047857"
            pointerEvents="none"
          >
            {s.name}
          </text>
        );
      })}
      {/* 광역시·세종 원형 버튼 */}
      {METRO_REGIONS.map((s) => {
        const [x, y] = pos(s);
        return (
          <g
            key={`c-${s.region}`}
            className="cursor-pointer"
            role="button"
            aria-label={s.name}
            onPointerDown={() => setPressed(s.region)}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            onClick={() => onSelect(s.region)}
          >
            <circle
              cx={x}
              cy={y}
              r={17}
              fill={pressed === s.region ? "#059669" : "#10b981"}
              stroke="white"
              strokeWidth={1.5}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={700}
              fill="white"
              pointerEvents="none"
            >
              {s.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
