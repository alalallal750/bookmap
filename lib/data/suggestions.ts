// 검색창 밑 추천 칩용 도서 목록 — 정보나루(data4library) 서울 20·30대 대출 데이터 기반.
// 월 1회 수동 갱신: "지금빌려 claude code" 작업 폴더의 fetch_suggestions.mjs 실행 →
// 결과(suggestions_candidates.md)에서 전자책 소장 여부 확인 후 이 배열 교체.
// coverUrl은 정보나루 srchDtlList, description은 스크립트가 카카오 우선(없으면
// 정보나루)으로 초안을 채움. 단 현재 5권의 description은 정보나루(줄거리)와
// 카카오(수상·맥락)를 손으로 섞어 다듬은 확정본 (2026-07-17) — 갱신 시에도
// 스크립트 초안을 그대로 쓰지 말고 두 소스를 섞어 다듬을 것.
// description이 빈 책은 팝업에서 소개 문단이 생략됨.
export type Suggestion = {
  title: string;
  isbn13: string;
  label: "hot" | "popular";
  author: string;
  publisher: string;
  /** 표지 이미지 — 정보나루 bookImageURL(알라딘 CDN)의 cover500 크기 */
  coverUrl: string;
  /** 책 소개 — 정보나루 제공. 없으면 빈 문자열(팝업에서 생략됨) */
  description: string;
};

export const suggestions: Suggestion[] = [
  {
    title: "첫 여름, 완주",
    isbn13: "9791197221989",
    label: "hot",
    author: "김금희",
    publisher: "무제",
    coverUrl: "https://image.aladin.co.kr/product/36275/58/cover500/k692038832_1.jpg",
    description:
      "배우 박정민이 시력을 잃은 아버지께 들려드리기 위해 기획한 '듣는 소설' 프로젝트의 첫 책으로 화제를 모은 김금희 장편소설. 원고 단계부터 오디오북에 초점을 맞춰 만들어졌고, 염정아·김의성·배성우 등 동료 배우들이 목소리 재능 기부로 낭독에 참여했다. 돈을 갚지 않고 사라진 선배의 고향 완주 마을을 찾은 성우 손열매가 합동 장의사 겸 매점을 지키며 각양각색의 동네 사람들을 만나는 이야기.",
  },
  {
    title: "연매장",
    isbn13: "9791141609962",
    label: "hot",
    author: "팡팡 · 문현선 옮김",
    publisher: "문학동네",
    coverUrl: "https://image.aladin.co.kr/product/36254/72/cover500/k322038527_1.jpg",
    description:
      "아들 칭린이 어머니 딩쯔타오의 과거를 추적하며 중국 현대사에서 희생된 개인들을 마주하는 이야기. 비판의식과 문학성을 훌륭하게 결합했다는 평가로 루야오문학상을 수상했지만, 수상 직후 중국 정부에서 금서로 지정됐다. 『우한일기』 이래 금서 작가로 지명당한 팡팡은 거대한 흐름 속에서 고군분투하는 개인의 눈을 통해 역사를 보여주고, 이데올로기에 파묻힌 인간의 존엄을 섬세하고 생동감 있게 그려왔다.",
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
  },
  {
    title: "홍학의 자리",
    isbn13: "9788954681155",
    label: "popular",
    author: "정해연",
    publisher: "문학동네",
    coverUrl: "https://image.aladin.co.kr/product/27587/94/cover500/8954681158_1.jpg",
    description:
      "출간 후 입소문만으로 역주행하며 베스트셀러에 오른 정해연 스릴러. \"호수가 다현의 몸을 삼켰다\"로 시작해 \"그런데, 다현은 누가 죽였을까?\"로 끝나는 프롤로그만으로 독자의 호기심을 강하게 불러일으킨다. 10년 가까이 스릴러 장르에 매진해 온 작가가 21개의 챕터마다 놀라운 전개와 탁월한 스토리텔링을 보여주는 대표작.",
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
  },
];
