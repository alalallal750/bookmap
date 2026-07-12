export function DataAttribution() {
  return (
    <p className="text-right text-[10px] text-gray-400 leading-relaxed mt-2">
      추천도서는 서울 공공도서관 20, 30대 대출 데이터를 기반으로 추출되었습니다. 출처 :{" "}
      <a
        href="https://www.data4library.kr"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        정보나루
      </a>
    </p>
  );
}
