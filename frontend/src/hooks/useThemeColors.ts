/**
 * テーマカラーフック
 * チャートやグラフ用のパレット対応カラー配列を提供
 */

const PALETTES: Record<string, string[]> = {
  pwc: [
    "#D04A02", "#2D8659", "#C69B1F", "#B02A2A", "#6366f1",
    "#0d9488", "#a855f7", "#e86B28", "#52A577", "#E1B84F",
  ],
  indigo: [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
    "#06b6d4", "#f43f5e", "#a855f7", "#14b8a6", "#eab308",
  ],
  teal: [
    "#14b8a6", "#0d9488", "#06b6d4", "#6366f1", "#f59e0b",
    "#10b981", "#ec4899", "#8b5cf6", "#f43f5e", "#eab308",
  ],
  emerald: [
    "#10b981", "#059669", "#06b6d4", "#6366f1", "#f59e0b",
    "#14b8a6", "#ec4899", "#8b5cf6", "#f43f5e", "#eab308",
  ],
  slate: [
    "#64748b", "#475569", "#6366f1", "#f59e0b", "#10b981",
    "#06b6d4", "#ec4899", "#8b5cf6", "#f43f5e", "#eab308",
  ],
  purple: [
    "#a855f7", "#9333ea", "#6366f1", "#ec4899", "#f59e0b",
    "#10b981", "#06b6d4", "#f43f5e", "#14b8a6", "#eab308",
  ],
};

export function useThemeColors(): string[] {
  const palette = document.documentElement.getAttribute("data-palette") ?? "pwc";
  return PALETTES[palette] ?? PALETTES.pwc;
}

export function getThemeColors(): string[] {
  const palette = document.documentElement.getAttribute("data-palette") ?? "pwc";
  return PALETTES[palette] ?? PALETTES.pwc;
}

export default useThemeColors;
