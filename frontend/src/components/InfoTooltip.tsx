import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

/**
 * パラメータ設定のツールチップコンポーネント
 * ホバーで説明を表示する。画面端では自動的に表示方向を調整。
 */

const WIDTH_MAP = {
  sm: "w-56",
  md: "w-72",
  lg: "w-96",
};

const WIDTH_PX: Record<string, number> = { sm: 224, md: 288, lg: 384 };

type HAlign = "center" | "left" | "right";

function InfoTooltip({
  text,
  title,
  width = "lg",
}: {
  text: string;
  title?: string;
  width?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [showBelow, setShowBelow] = useState(false);
  const [hAlign, setHAlign] = useState<HAlign>("center");

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const tooltipW = WIDTH_PX[width] ?? 384;
      const halfW = tooltipW / 2;

      // 垂直方向
      setShowBelow(rect.top < 150);

      // 水平方向: サイドバー（左端）やウィンドウ右端に近い場合に補正
      if (rect.left < halfW + 20) {
        setHAlign("left");
      } else if (window.innerWidth - rect.right < halfW + 20) {
        setHAlign("right");
      } else {
        setHAlign("center");
      }
    }
  };

  const positionClass = showBelow
    ? "top-full mt-2"
    : "bottom-full mb-2";

  const hAlignClass =
    hAlign === "left" ? "left-0"
    : hAlign === "right" ? "right-0"
    : "left-1/2 -translate-x-1/2";

  const arrowHClass = "left-1/2 -translate-x-1/2";

  const arrowClass = showBelow
    ? `absolute bottom-full ${arrowHClass} border-4 border-transparent border-b-gray-900 dark:border-b-gray-700`
    : `absolute top-full ${arrowHClass} border-4 border-transparent border-t-gray-900 dark:border-t-gray-700`;

  return (
    <span ref={ref} className="relative group inline-flex ml-1" onMouseEnter={handleMouseEnter}>
      <HelpCircle
        size={13}
        className="text-gray-400 dark:text-gray-500 cursor-help"
      />
      <span
        className={`absolute ${positionClass} ${hAlignClass} px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg whitespace-normal ${WIDTH_MAP[width]} text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[9999] pointer-events-none`}
      >
        {title && (
          <span className="block font-semibold mb-1 text-gray-200">{title}</span>
        )}
        {text}
        <span className={arrowClass} />
      </span>
    </span>
  );
}

export default InfoTooltip;
