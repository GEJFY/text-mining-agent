import { Database } from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export default function DatasetGuard({ children }: Props) {
  const { activeDatasetId } = useAnalysisStore();

  if (!activeDatasetId) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
          <Database size={48} className="mb-4 opacity-50" />
          <p className="text-lg font-medium">
            データセットが選択されていません
          </p>
          <p className="text-sm mt-1">
            先にインポートページでデータをアップロードしてください
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
