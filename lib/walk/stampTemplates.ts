/**
 * [2026-07-22 v3 — 책 산책 21-5] 스탬프 "템플릿" 프리셋.
 *
 * v2의 요소 토글 방식을 폐기하고, 데이터가 다 준비된 상태에서 여러 완성 조합을
 * 썸네일 앨범으로 보여주고 하나 고르는 방식으로 전환(사용자 요청). 템플릿마다
 * 히어로·요소·배치·폰트가 달라 정보량과 톤이 다르다. 같은 데이터를 어느
 * 템플릿에 올리든 canvas 렌더러(drawStamp)가 동일하게 그린다.
 */
import { HeroKey, StampElementKey } from "./stampContent";

export type StampFont = "sans" | "mono" | "dohyeon" | "jua" | "yeonsung" | "kirang";
export type StampPos = "bottomLeft" | "bottomCenter" | "topLeft" | "center";

/** 단일 웨이트 디스플레이 폰트(배민 서체) — 가짜 볼드 방지 위해 400 고정. */
export const DISPLAY_FONTS: ReadonlySet<StampFont> = new Set<StampFont>([
  "dohyeon",
  "jua",
  "yeonsung",
  "kirang",
]);

export type StampTemplate = {
  id: string;
  /** 크게 강조할 요소(없으면 히어로 없이 스탯 위주) */
  hero: HeroKey | null;
  /** 함께 보여줄 메타 요소(순서 의미 있음) */
  elements: StampElementKey[];
  pos: StampPos;
  font: StampFont;
  /** 히어로 숫자 강조색 */
  accent: string;
  /** 숫자 스탯(거리·걸음수·N번째·날짜)을 한 줄 인라인으로 */
  inlineStats?: boolean;
};

/**
 * 폰트 스택. 배민 서체(도현·주아·연성·기랑해랑)는 Fontsource로 self-host —
 * @fontsource CSS를 import하면 @font-face가 등록된다(StampEditor에서 import).
 * canvas는 그리기 전 document.fonts.load로 로딩을 기다려야 함(drawStamp 호출부).
 */
export const FONT_STACKS: Record<StampFont, string> = {
  sans: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif",
  mono: "'DM Mono','SFMono-Regular','Consolas','Courier New',monospace",
  dohyeon: "'Do Hyeon','Malgun Gothic',sans-serif", // 배민 도현 — 굵은 간판체
  jua: "'Jua','Malgun Gothic',sans-serif", // 배민 주아 — 둥근 손글씨
  yeonsung: "'Yeon Sung','Malgun Gothic',cursive", // 배민 연성 — 붓글씨
  kirang: "'Kirang Haerang','Malgun Gothic',cursive", // 배민 기랑해랑 — 붓펜 손글씨
};

/** canvas 렌더 전 로딩을 기다려야 하는 배민 서체 family 이름들. */
export const STAMP_FONT_FAMILIES = ["Do Hyeon", "Jua", "Yeon Sung", "Kirang Haerang"];

const MINT = "#5eead4";
const AMBER = "#fbbf24";
const WHITE = "#ffffff";

/**
 * 정보량·배치·폰트가 서로 다른 프리셋들 — 앨범에 썸네일로 노출.
 * 데이터가 없는 요소는 렌더 단계에서 자동 생략되므로 안전.
 */
export const STAMP_TEMPLATES: StampTemplate[] = [
  // 심플: 거리 크게(도현 간판체) + 책만
  { id: "clean", hero: "distance", elements: ["book"], pos: "bottomLeft", font: "dohyeon", accent: WHITE },
  // 풀 스탯: 러닝 앱 톤(큰 숫자 + 스탯 줄 + 도서관), 주아 둥근체
  { id: "stat", hero: "distance", elements: ["book", "steps", "datetime", "library"], pos: "bottomLeft", font: "jua", accent: MINT, inlineStats: true },
  // 타이틀: 책 제목을 붓글씨(연성)로 크게 가운데
  { id: "title", hero: "book", elements: ["library", "datetime"], pos: "center", font: "yeonsung", accent: WHITE },
  // 걸음 강조(도현 간판체 큰 숫자)
  { id: "steps", hero: "steps", elements: ["book", "library"], pos: "bottomLeft", font: "dohyeon", accent: AMBER },
  // N번째 뱃지(좌상단, 주아)
  { id: "badge", hero: "walkCount", elements: ["book", "library", "distance"], pos: "topLeft", font: "jua", accent: MINT },
  // 인라인 미니: 히어로 없이 스탯 한 줄(하단 가운데, 모노 숫자)
  { id: "line", hero: null, elements: ["distance", "steps", "datetime", "library"], pos: "bottomCenter", font: "mono", accent: WHITE, inlineStats: true },
  // 엽서: 책 제목 붓펜 손글씨(기랑해랑) + 도서관·거리
  { id: "postcard", hero: "book", elements: ["library", "distance", "datetime"], pos: "bottomLeft", font: "kirang", accent: AMBER },
];

export function getTemplate(id: string): StampTemplate {
  return STAMP_TEMPLATES.find((t) => t.id === id) ?? STAMP_TEMPLATES[0];
}
