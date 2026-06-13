import { Availability } from "@/types";
import { EbookSection } from "./EbookSection";
import { PhysicalSection } from "./PhysicalSection";

type AvailabilityPanelProps = {
  isbn: string;
  availability: Availability;
};

export function AvailabilityPanel({ isbn, availability }: AvailabilityPanelProps) {
  return (
    <div>
      <EbookSection />
      {/* 오디오북 (향후) */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🎧</span>
          <h2 className="font-bold text-gray-900 text-base">오디오북</h2>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="text-2xl">🔜</span>
          <div>
            <p className="text-sm font-medium text-gray-600">곧 지원 예정</p>
            <p className="text-xs text-gray-400 mt-0.5">
              오디오북 서비스 연동을 준비 중이에요
            </p>
          </div>
        </div>
      </div>
      <PhysicalSection
        isbn={isbn}
        physical={availability.physical}
        smartLibrary={availability.smartLibrary}
      />
    </div>
  );
}
