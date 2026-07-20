// 검색창 밑 추천 칩용 도서 목록 — 정보나루(data4library) 서울 20·30대 대출 데이터 기반.
// [2026-07-20] 10권 체제: 원작 1(media, 수동 고정) + 급상승 3(hot) + 대출순위 3(popular)
// + 마니아 3(mania, 월간 1위 책 시드의 독자 추천에서 같은저자 제외).
// 월 1회 수동 갱신: "지금빌려 claude code" 작업 폴더의 fetch_suggestions10.mjs 실행 →
// suggestions10_candidates.md 검수 후 이 배열 교체. media 항목은 스크립트 상수라 갱신돼도 유지.
// description은 정보나루(줄거리)와 카카오(수상·맥락)를 손으로 섞어 다듬은 확정본만 배포 —
// 스크립트 초안(suggestions10.json)을 그대로 쓰지 말 것 (2026-07-17 결정).
// description이 빈 책은 팝업에서 소개 문단이 생략됨.
export type SuggestionStory = {
  /** 통계 기준 월 (예: "2026-06") — usageAnalysisList loanHistory 기준 */
  month: string;
  /** 기준 월 전국 대출 건수 */
  lastMonthLoanCnt?: number;
  /** 기준 월 전국 대출 순위 — 50위 이내일 때만 채움 (그 밖은 스토리로 부적합) */
  lastMonthRank?: number;
  /** 대출 1~3위 그룹일 때만 채움 (예: "30대 여성") — loanGrps 기준 */
  topGroup?: string;
  topGroupRank?: number;
};

export type Suggestion = {
  title: string;
  isbn13: string;
  label: "hot" | "popular" | "mania" | "media";
  /** 칩 축약 라벨 — mania(시드 책 제목 포함)·media용. 없으면 label 기본 문구 */
  chipLabel?: string;
  /** 팝업 문장형 라벨 — 없으면 label 기본 문구 */
  popupLabel?: string;
  /**
   * 지도 헤더 스토리텔링 매칭용 판본 ISBN 전체(자신 포함, 완전일치로만 대조).
   * 없으면 isbn13 하나만 매칭. 순위 병합 부산물 + 카카오 판본 조회(저자 일치)로 채움.
   */
  matchIsbns?: string[];
  author: string;
  publisher: string;
  /** 표지 이미지 — 정보나루 bookImageURL(알라딘 CDN)의 cover500 크기 */
  coverUrl: string;
  /** 책 소개 — 정보나루 제공. 없으면 빈 문자열(팝업에서 생략됨) */
  description: string;
  /** 지도 헤더 스트립·팝업용 대출 통계 — 검증된 값만(전국 순위·건수, 그룹 1~3위) */
  story?: SuggestionStory;
};

/** 지도 페이지 헤더 스트립용 — ISBN 완전일치로 추천 도서 찾기 (판본 포함) */
export function findSuggestionByIsbn(isbn: string): Suggestion | undefined {
  return suggestions.find(
    (s) => s.isbn13 === isbn || (s.matchIsbns ?? []).includes(isbn)
  );
}

export const suggestions: Suggestion[] = [
  // ── 원작 슬롯 (수동 고정 — 갱신 시에도 유지, fetch_suggestions10.mjs의 MEDIA 상수와 동기) ──
  {
    title: "울 1",
    isbn13: "9791169256186",
    label: "media",
    chipLabel: "애플TV 〈사일로〉 원작",
    popupLabel: "애플TV 드라마 〈사일로〉의 원작 소설이에요",
    author: "휴 하위 · 이수현 옮김",
    publisher: "시공사",
    coverUrl: "https://image.aladin.co.kr/product/31568/64/cover500/k372832652_2.jpg",
    description:
      "애플TV 화제작 〈사일로〉의 원작, 휴 하위의 '사일로 3부작' 첫 권. 유해 물질로 뒤덮인 지상을 피해 인류가 거대한 지하 사일로에서 살아가는 세계 — 바깥을 보고 싶다고 말하는 순간 추방되는 곳에서, 보안관 홀스턴이 스스로 청소형을 자원하며 이야기가 시작된다. 아마존 셀프 퍼블리싱으로 출발해 세계적 베스트셀러가 된 SF 현상 그 자체.",
    // 사일로 시리즈 전 판본 — 국내 출간된 휴 하위 책은 전부 사일로 (2026-07-20 카카오 전수 확인)
    matchIsbns: [
      "9791169256186", // 울 1 (시공사)
      "9791169256193", // 울 2 (시공사)
      "9788952770141", // 울 1 (검은숲 구판)
      "9788952770158", // 울 2 (검은숲 구판)
      "9791169256209", // 시프트 1
      "9791169256216", // 시프트 2
      "9791169256223", // 더스트 1
      "9791169256230", // 더스트 2
      "9791169256162", // 사일로 연대기 세트
    ],
  },
  // ── 급상승 3 (2026-06, 전월 대비) ──
  {
    title: "첫 여름, 완주",
    isbn13: "9791197221989",
    label: "hot",
    author: "김금희",
    publisher: "무제",
    coverUrl: "https://image.aladin.co.kr/product/36275/58/cover500/k692038832_1.jpg",
    description:
      "배우 박정민이 시력을 잃은 아버지께 들려드리기 위해 기획한 '듣는 소설' 프로젝트의 첫 책으로 화제를 모은 김금희 장편소설. 원고 단계부터 오디오북에 초점을 맞춰 만들어졌고, 염정아·김의성·배성우 등 동료 배우들이 목소리 재능 기부로 낭독에 참여했다. 돈을 갚지 않고 사라진 선배의 고향 완주 마을을 찾은 성우 손열매가 합동 장의사 겸 매점을 지키며 각양각색의 동네 사람들을 만나는 이야기.",
    matchIsbns: ["9791197221989", "9791199364417"], // + 읽는 소설 판
    story: { month: "2026-06", lastMonthLoanCnt: 1534 },
  },
  {
    title: "아무도 오지 않는 곳에서",
    isbn13: "9791193078709",
    label: "hot",
    author: "천선란",
    publisher: "허블",
    coverUrl: "https://image.aladin.co.kr/product/37425/80/cover500/k242032998_1.jpg",
    description:
      "『천 개의 파랑』으로 한국과학문학상 장편 대상을 수상하고 세계가 주목하는 작가로 자리매김한 천선란의 두 번째 연작소설. 데뷔 초 발표한 단편의 세계관을 6년에 걸쳐 확장해 완성한 3부작으로, 그가 오랫동안 사랑해 온 '좀비 아포칼립스'라는 무대 위에서 인간과 비인간, 상실과 돌봄의 윤리를 가장 극단까지 밀어붙인 작품이다.",
    matchIsbns: ["9791193078709", "9791193078877"], // + 큰글자도서
    story: { month: "2026-06", lastMonthLoanCnt: 1029 },
  },
  {
    title: "밝은 밤",
    isbn13: "9788954681179",
    label: "hot",
    author: "최은영",
    publisher: "문학동네",
    coverUrl: "https://image.aladin.co.kr/product/27541/91/cover500/8954681174_1.jpg",
    description:
      "『쇼코의 미소』 『내게 무해한 사람』으로 폭넓은 독자의 지지를 받아온 최은영의 첫 장편소설. 이혼 후 할머니가 사는 도시 희령으로 떠난 지연이 그곳에서 증조모부터 엄마까지, 네 여성으로 이어지는 백 년의 시간을 전해 듣는 이야기. 출간 후 대산문학상을 수상하며 오래 사랑받아 온 소설이 올여름 도서관에서 다시 순위를 끌어올리고 있다.",
    matchIsbns: ["9788954681179", "9788954699730"], // + 리커버판
    story: { month: "2026-06", lastMonthLoanCnt: 1394 },
  },
  // ── 대출순위 3 (2026-06 서울 20+30대 합산) ──
  {
    title: "홍학의 자리",
    isbn13: "9788954681155",
    label: "popular",
    author: "정해연",
    publisher: "엘릭시르",
    coverUrl: "https://image.aladin.co.kr/product/27587/94/cover500/8954681158_1.jpg",
    description:
      "출간 후 입소문만으로 역주행하며 베스트셀러에 오른 정해연 스릴러. \"호수가 다현의 몸을 삼켰다\"로 시작해 \"그런데, 다현은 누가 죽였을까?\"로 끝나는 프롤로그만으로 독자의 호기심을 강하게 불러일으킨다. 10년 가까이 스릴러 장르에 매진해 온 작가가 21개의 챕터마다 놀라운 전개와 탁월한 스토리텔링을 보여주는 대표작.",
    story: {
      month: "2026-06",
      lastMonthLoanCnt: 2208,
      lastMonthRank: 10,
      topGroup: "20대 여성",
      topGroupRank: 3,
    },
  },
  {
    title: "혼모노",
    isbn13: "9788936439743",
    label: "popular",
    author: "성해나",
    publisher: "창비",
    coverUrl: "https://image.aladin.co.kr/product/36101/66/cover500/893643974x_1.jpg",
    // 정보나루에 소개 미제공 — 카카오 책검색 contents에서 보완 (잘린 마지막 문장 제거, 2026-07-17)
    description:
      "2024·2025 젊은작가상, 2024 이효석문학상 우수작품상 수상작 수록. 작품마다 치밀한 취재와 정교한 구성을 바탕으로 한 개성적인 캐릭터와 강렬하고도 서늘한 서사로 평단과 독자의 주목을 고루 받으며, 새로운 세대의 리얼리즘을 열어가고 있다고 평가받는 작가 성해나의 두 번째 소설집.",
    matchIsbns: ["9788936439743", "9788936400002"], // + 큰글자도서
    story: {
      month: "2026-06",
      lastMonthLoanCnt: 2914,
      lastMonthRank: 3,
      topGroup: "30대 여성",
      topGroupRank: 1,
    },
  },
  {
    title: "소년이 온다",
    isbn13: "9788936434120",
    label: "popular",
    author: "한강",
    publisher: "창비",
    coverUrl: "https://image.aladin.co.kr/product/4086/97/cover500/8936434128_2.jpg",
    description:
      "1980년 5월 광주, 계엄군에 맞섰던 소년 동호와 그 곁에 남은 사람들의 이야기. 만해문학상·말라파르테 문학상을 수상하고 20여 개국에 번역되며 \"한강을 뛰어넘은 한강의 소설\"(신형철)이라 불린 대표작으로, 노벨문학상 수상 이후 다시 전 세대가 함께 읽는 책이 됐다.",
    matchIsbns: ["9788936434120", "9788936434410"], // + 특별한정판
    story: {
      month: "2026-06",
      lastMonthLoanCnt: 3368,
      lastMonthRank: 2,
      topGroup: "20대 여성",
      topGroupRank: 1,
    },
  },
  // ── 마니아 3 (시드: 홍학의 자리 — 같은저자·중복저자 제외) ──
  {
    title: "절창",
    isbn13: "9791141602451",
    label: "mania",
    chipLabel: "『홍학의 자리』 독자의 다음 책",
    popupLabel: "『홍학의 자리』 독자들이 함께 많이 빌린 책이에요",
    author: "구병모",
    publisher: "문학동네",
    coverUrl: "https://image.aladin.co.kr/product/37172/36/cover500/k662031678_1.jpg",
    // 정보나루·카카오 소개가 짧아 기사(한국경제 2025-09 서평)를 바탕으로 작성 (2026-07-20)
    description:
      "『파과』의 구병모가 선보이는 신작 장편소설. '절창(切創)'은 예리한 것에 베인 상처라는 뜻 — 타인의 상처에 손을 대면 그 마음을 읽어내는 여성 '아가씨'가 생활고 끝에 범죄 조직의 보스에게 의탁하면서, 능력을 이용하려는 자와 복수를 품고 다가온 자 사이에 놓인다. 특유의 집요한 묘사와 서늘한 유머로, 진심과 오독 사이에서 타인을 이해한다는 일의 아슬아슬함을 파고든다.",
    story: {
      month: "2026-06",
      lastMonthLoanCnt: 2539,
      lastMonthRank: 5,
      topGroup: "20대 여성",
      topGroupRank: 2,
    },
  },
  {
    title: "안녕이라 그랬어",
    isbn13: "9791141602376",
    label: "mania",
    chipLabel: "『홍학의 자리』 독자의 다음 책",
    popupLabel: "『홍학의 자리』 독자들이 함께 많이 빌린 책이에요",
    author: "김애란",
    publisher: "문학동네",
    coverUrl: "https://image.aladin.co.kr/product/36566/52/cover500/k462039240_1.jpg",
    // 정보나루·카카오 소개가 짧아 기사(경향·노컷 2026-07 인터뷰, 경향 2025-12 올해의 소설)를 바탕으로 작성 (2026-07-20)
    description:
      "『두근두근 내 인생』 『바깥은 여름』의 김애란이 팔 년 만에 선보인 소설집. '영끌'이라는 말에서 우리 시대 영혼의 자리를 되묻는 작가가, 돈과 이웃 사이의 미묘한 긴장을 일곱 편의 단편에 담았다. 김승옥문학상·오영수문학상 수상작이 수록됐고, 동료 소설가 50명이 뽑은 '올해의 소설'로 선정되며 지금 도서관에서 가장 많이 빌려 가는 책이 됐다.",
    story: {
      month: "2026-06",
      lastMonthLoanCnt: 3485,
      lastMonthRank: 1,
      topGroup: "40대 여성",
      topGroupRank: 1,
    },
  },
  {
    title: "가공범",
    isbn13: "9791170612759",
    label: "mania",
    chipLabel: "『홍학의 자리』 독자의 다음 책",
    popupLabel: "『홍학의 자리』 독자들이 함께 많이 빌린 책이에요",
    author: "히가시노 게이고 · 김선영 옮김",
    publisher: "교보문고",
    coverUrl: "https://image.aladin.co.kr/product/36786/80/cover500/k472030698_2.jpg",
    description:
      "데뷔 40주년을 맞은 히가시노 게이고가 새 시리즈의 문을 여는 장편소설. \"이 소재를 작품으로 쓸 날은 오지 않을 거라고 생각했다\"고 스스로 밝힌 소재를 정면으로 다루며, 형사 고다이 쓰토무가 진실을 좇는다. 단행본 누계 1억 부를 돌파한 '오늘의 일본을 대표하는 작가'의 신작.",
    story: { month: "2026-06", lastMonthLoanCnt: 1511 },
  },
];
