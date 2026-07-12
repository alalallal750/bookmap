type LoadingSpinnerProps = {
  size?: "sm" | "md" | "lg";
  message?: string;
  /** 전자책(blue) / 종이책(green) 페이지 테마 — 스피너 색상에 반영. */
  theme?: "blue" | "green";
};

export function LoadingSpinner({ size = "md", message, theme = "green" }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-3",
  }[size];
  const spinColor = theme === "blue" ? "border-t-blue-600" : "border-t-green-600";

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div
        className={`${sizeClass} rounded-full border-gray-200 ${spinColor} animate-spin`}
        role="status"
        aria-label="불러오는 중"
      />
      {message && (
        <p className="text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
}
