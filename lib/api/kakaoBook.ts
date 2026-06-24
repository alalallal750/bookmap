/**
 * lib/api/kakaoBook.ts
 *
 * 카카오 책 검색 API(다음 책검색, dapi.kakao.com/v3/search/book)로
 * 책 제목 검색 시 ISBN 후보 목록을 가져오는 함수.
 *
 * [배경] 서울도서관 통합검색은 구마다 ISBN 필드 제공 여부가 달라서
 * (송파구·성북구는 제목 검색 응답에 ISBN이 없거나 누락되는 문제가
 * 있었음 — 이슈 D), "제목으로 검색 → 응답의 ISBN을 신뢰" 방식 대신
 * "외부 API로 ISBN을 먼저 확정 → 그 ISBN으로 직접 검색" 방식으로 전환.
 * 카카오 ISBN으로 검색(category1=7)하면 송파구·성북구 모두 정상
 * 매칭됨을 실측으로 확인함(2026-06-24).
 *
 * REST API 키는 이미 카카오맵용으로 발급된 KAKAO_REST_KEY를 그대로
 * 재사용 — 책 검색은 콘솔에서 별도로 활성화하는 절차가 없고, 키만
 * 있으면 바로 호출됨(2026-06-24 직접 호출로 확인).
 */

import { KakaoBookCandidate } from "@/types";

/**
 * 카카오 응답의 isbn 필드는 두 가지 형태가 섞여서 옴:
 *   - "1165341905 9791165341909" (10자리 + 공백 + 13자리)
 *   - "9791175726109" (13자리만)
 *   - " 9791175726109" (앞에 공백만 있고 10자리 없음 — 실측으로 확인된 변형)
 * 13자리(ISBN-13)만 골라서 반환. 13자리가 안 보이면 빈 문자열 반환 —
 * 호출부에서 빈 ISBN은 후보 목록에서 제외해야 함(서울도서관 검색에
 * ISBN 없이는 못 거는 게 이번 설계의 전제이므로).
 */
function extractIsbn13(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter((t) => t.length > 0);
  const isbn13 = tokens.find((t) => t.length === 13);
  return isbn13 ?? "";
}

/**
 * 책 제목으로 카카오 책 검색 → ISBN 후보 목록 반환.
 * ISBN이 끝내 없는 항목(extractIsbn13 결과가 빈 문자열)은 애초에
 * 후보 목록에서 제외 — 이번 설계는 ISBN이 있어야만 다음 단계(서울도서관
 * ISBN 검색)로 진행 가능하므로, ISBN 없는 후보를 보여주는 건 의미 없음.
 *
 * 카카오 검색 자체가 0건이면 빈 배열 반환 — 호출부(API 라우트)에서
 * "0건이면 제목으로 직접 fallback" 처리를 하게 됨.
 */
export async function searchKakaoBookCandidates(
  query: string
): Promise<KakaoBookCandidate[]> {
  const restApiKey = process.env.KAKAO_REST_KEY;
  if (!restApiKey) {
    console.log("[kakaoBook] KAKAO_REST_KEY 환경변수 없음 — 카카오 검색 스킵");
    return [];
  }

  const url = `https://dapi.kakao.com/v3/search/book?target=title&size=20&query=${encodeURIComponent(
    query
  )}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    console.log("[kakaoBook] 응답 상태:", res.status, "query:", query);

    if (!res.ok) {
      console.log("[kakaoBook] 응답 실패, body:", await res.text());
      return [];
    }

    const json = await res.json();
    const documents: any[] = json.documents ?? [];

    console.log(
      "[kakaoBook] total_count:",
      json.meta?.total_count,
      "받은 건수:",
      documents.length
    );

    const candidates: KakaoBookCandidate[] = [];
    for (const doc of documents) {
      const isbn = extractIsbn13(doc.isbn ?? "");
      if (!isbn) {
        console.log(
          "[kakaoBook] ISBN-13 추출 실패, 후보 제외 — title:",
          doc.title,
          "raw isbn:",
          doc.isbn
        );
        continue;
      }
      candidates.push({
        isbn,
        title: doc.title,
        authors: doc.authors ?? [],
        publisher: doc.publisher ?? "",
        thumbnail: doc.thumbnail || undefined,
        publishedDate: doc.datetime || undefined,
      });
    }

    return candidates;
  } catch (e) {
    console.log("[kakaoBook] 요청 실패:", e);
    return [];
  }
}