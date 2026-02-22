import { useState, useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";

/** 分析ステップ定義 */
export interface AnalysisStep {
  label: string;
  estimatedSeconds?: number;
}

interface AnalysisProgressProps {
  steps: AnalysisStep[];
  isRunning: boolean;
}

/**
 * 分析進捗タイムライン
 * isRunning中にステップを推定時間で自動進行。
 * 完了→緑チェック、実行中→パルスアニメ、未着手→グレー
 */
function AnalysisProgress({ steps, isRunning }: AnalysisProgressProps) {
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentStep(-1);
      return;
    }

    // 開始時にステップ0へ
    setCurrentStep(0);

    // 各ステップの推定時間に基づいて自動進行
    let stepIdx = 0;
    const advance = () => {
      stepIdx++;
      if (stepIdx < steps.length) {
        setCurrentStep(stepIdx);
        const nextDelay = (steps[stepIdx].estimatedSeconds ?? 3) * 1000;
        timerRef.current = setTimeout(advance, nextDelay);
      }
    };

    const firstDelay = (steps[0]?.estimatedSeconds ?? 3) * 1000;
    timerRef.current = setTimeout(advance, firstDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, steps]);

  if (!isRunning) return null;

  return (
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        分析進捗
      </h4>
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;
          const isPending = idx > currentStep;

          return (
            <div key={idx} className="flex items-start gap-3 relative">
              {/* 縦線 */}
              {idx < steps.length - 1 && (
                <div
                  className={`absolute left-[11px] top-6 w-0.5 h-full ${
                    isCompleted
                      ? "bg-emerald-400"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}

              {/* アイコン */}
              <div className="relative z-10 flex-shrink-0 mt-0.5">
                {isCompleted ? (
                  <div className="w-[22px] h-[22px] rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check size={12} className="text-white" strokeWidth={3} />
                  </div>
                ) : isActive ? (
                  <div className="w-[22px] h-[22px] rounded-full bg-nexus-500 flex items-center justify-center animate-pulse">
                    <Loader2
                      size={12}
                      className="text-white animate-spin"
                    />
                  </div>
                ) : (
                  <div className="w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                  </div>
                )}
              </div>

              {/* ラベル */}
              <div className="pb-4">
                <span
                  className={`text-sm ${
                    isCompleted
                      ? "text-emerald-600 dark:text-emerald-400 font-medium"
                      : isActive
                        ? "text-nexus-700 dark:text-nexus-300 font-semibold"
                        : isPending
                          ? "text-gray-400 dark:text-gray-500"
                          : ""
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnalysisProgress;

/** 各分析種別のプリセットステップ */
export const ANALYSIS_STEPS: Record<string, AnalysisStep[]> = {
  cluster: [
    { label: "Embedding生成", estimatedSeconds: 5 },
    { label: "UMAP次元削減", estimatedSeconds: 4 },
    { label: "クラスタリング実行", estimatedSeconds: 3 },
    { label: "LLMラベリング", estimatedSeconds: 8 },
  ],
  sentiment: [
    { label: "テキスト前処理", estimatedSeconds: 2 },
    { label: "LLM感情分析", estimatedSeconds: 10 },
    { label: "時系列集計", estimatedSeconds: 2 },
  ],
  cooccurrence: [
    { label: "形態素解析", estimatedSeconds: 3 },
    { label: "共起行列構築", estimatedSeconds: 3 },
    { label: "コミュニティ検出", estimatedSeconds: 4 },
    { label: "ネットワーク構築", estimatedSeconds: 2 },
  ],
  causalChain: [
    { label: "テキスト読み込み", estimatedSeconds: 2 },
    { label: "LLM因果関係抽出", estimatedSeconds: 12 },
    { label: "信頼度スコアリング", estimatedSeconds: 3 },
  ],
  contradiction: [
    { label: "テキスト読み込み", estimatedSeconds: 2 },
    { label: "LLM矛盾検出", estimatedSeconds: 12 },
    { label: "分類・スコアリング", estimatedSeconds: 3 },
  ],
  actionability: [
    { label: "テキスト読み込み", estimatedSeconds: 2 },
    { label: "LLM 5次元評価", estimatedSeconds: 12 },
    { label: "カテゴリ分類", estimatedSeconds: 3 },
  ],
  taxonomy: [
    { label: "テキスト読み込み", estimatedSeconds: 2 },
    { label: "LLM階層生成", estimatedSeconds: 12 },
    { label: "テキスト分類", estimatedSeconds: 4 },
  ],
};
