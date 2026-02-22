import { HelpCircle } from "lucide-react";

/**
 * パラメータ設定のツールチップコンポーネント
 * ホバーで説明を表示する
 */

const WIDTH_MAP = {
  sm: "w-56",
  md: "w-72",
  lg: "w-96",
};

function InfoTooltip({
  text,
  title,
  width = "lg",
}: {
  text: string;
  title?: string;
  width?: "sm" | "md" | "lg";
}) {
  return (
    <span className="relative group inline-flex ml-1">
      <HelpCircle
        size={13}
        className="text-gray-400 dark:text-gray-500 cursor-help"
      />
      <span
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg whitespace-normal ${WIDTH_MAP[width]} text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none`}
      >
        {title && (
          <span className="block font-semibold mb-1 text-gray-200">{title}</span>
        )}
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
      </span>
    </span>
  );
}

export default InfoTooltip;
