type BadgeProps = {
  available: boolean;
  copyInfo?: string;
  className?: string;
};

export function AvailableBadge({ available, copyInfo, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        available
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-600"
      } ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          available ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {available ? "대출가능" : "대출중"}
      {copyInfo && (
        <span className="ml-0.5 opacity-75">({copyInfo})</span>
      )}
    </span>
  );
}
