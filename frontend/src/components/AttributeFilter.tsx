import { useState, useEffect } from "react";
import { Filter, ChevronDown, ChevronRight, Search } from "lucide-react";
import { datasetsApi } from "../api/client";

/**
 * 属性フィルタコンポーネント
 * カテゴリ→チェックボックス（検索付き）、数値→min/max、日付→範囲、テキスト→検索
 */

interface AttributeMeta {
  name: string;
  type: "categorical" | "numeric" | "text" | "date";
  unique_values: string[];
  unique_count: number;
  min_value?: number;
  max_value?: number;
}

export type Filters = Record<string, string[] | { min?: number; max?: number } | { from?: string; to?: string } | string>;

interface AttributeFilterProps {
  datasetId: string | null;
  filters: Filters;
  onChange: (filters: Filters) => void;
}

/** 日付型属性の自動判定 */
function isDateAttribute(attr: AttributeMeta): boolean {
  if (attr.type === "date") return true;
  const n = attr.name.toLowerCase();
  return n.includes("date") || n.includes("日付") || n.endsWith("_at") || n.endsWith("_date");
}

function AttributeFilter({ datasetId, filters, onChange }: AttributeFilterProps) {
  const [attributes, setAttributes] = useState<AttributeMeta[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catSearch, setCatSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!datasetId) {
      setAttributes([]);
      return;
    }
    setLoading(true);
    datasetsApi
      .getAttributes(datasetId)
      .then((res) => setAttributes(res.data.attributes ?? []))
      .catch(() => setAttributes([]))
      .finally(() => setLoading(false));
  }, [datasetId]);

  // フィルタ対象の属性のみ（unique_count > 0）
  const visibleAttrs = attributes.filter((a) => a.unique_count > 0);

  if (!datasetId || visibleAttrs.length === 0) return null;

  const activeCount = Object.keys(filters).length;

  const updateFilter = (name: string, value: Filters[string] | undefined) => {
    const next = { ...filters };
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      delete next[name];
    } else {
      next[name] = value;
    }
    onChange(next);
  };

  return (
    <div className="card p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"
      >
        <Filter size={16} />
        属性フィルタ
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-nexus-100 dark:bg-nexus-900 text-nexus-700 dark:text-nexus-300">
            {activeCount}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400">読み込み中...</p>
          ) : (
            visibleAttrs.map((attr) => {
              const isDate = isDateAttribute(attr);

              return (
                <div key={attr.name}>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {attr.name}
                    {isDate && <span className="ml-1 text-gray-400">(日付)</span>}
                  </p>

                  {/* 日付型: 範囲入力 */}
                  {isDate && (
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={((filters[attr.name] as { from?: string; to?: string })?.from) ?? ""}
                        onChange={(e) => {
                          const current = (filters[attr.name] as { from?: string; to?: string }) ?? {};
                          const from = e.target.value || undefined;
                          const to = current.to;
                          if (!from && !to) {
                            updateFilter(attr.name, undefined);
                          } else {
                            updateFilter(attr.name, { from, to });
                          }
                        }}
                        className="input-field text-xs py-1 flex-1"
                      />
                      <span className="text-xs text-gray-400 self-center">~</span>
                      <input
                        type="date"
                        value={((filters[attr.name] as { from?: string; to?: string })?.to) ?? ""}
                        onChange={(e) => {
                          const current = (filters[attr.name] as { from?: string; to?: string }) ?? {};
                          const from = current.from;
                          const to = e.target.value || undefined;
                          if (!from && !to) {
                            updateFilter(attr.name, undefined);
                          } else {
                            updateFilter(attr.name, { from, to });
                          }
                        }}
                        className="input-field text-xs py-1 flex-1"
                      />
                    </div>
                  )}

                  {/* 数値型: min/max入力 */}
                  {!isDate && attr.type === "numeric" && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder={attr.min_value !== undefined ? `Min (${attr.min_value})` : "Min"}
                        value={((filters[attr.name] as { min?: number; max?: number })?.min) ?? ""}
                        onChange={(e) => {
                          const current = (filters[attr.name] as { min?: number; max?: number }) ?? {};
                          const min = e.target.value ? Number(e.target.value) : undefined;
                          const max = current.max;
                          if (min === undefined && max === undefined) {
                            updateFilter(attr.name, undefined);
                          } else {
                            updateFilter(attr.name, { min, max });
                          }
                        }}
                        className="input-field text-xs py-1 flex-1"
                      />
                      <span className="text-xs text-gray-400 self-center">~</span>
                      <input
                        type="number"
                        placeholder={attr.max_value !== undefined ? `Max (${attr.max_value})` : "Max"}
                        value={((filters[attr.name] as { min?: number; max?: number })?.max) ?? ""}
                        onChange={(e) => {
                          const current = (filters[attr.name] as { min?: number; max?: number }) ?? {};
                          const min = current.min;
                          const max = e.target.value ? Number(e.target.value) : undefined;
                          if (min === undefined && max === undefined) {
                            updateFilter(attr.name, undefined);
                          } else {
                            updateFilter(attr.name, { min, max });
                          }
                        }}
                        className="input-field text-xs py-1 flex-1"
                      />
                    </div>
                  )}

                  {/* カテゴリ型: チェックボックス + 検索（常時表示） */}
                  {!isDate && attr.type === "categorical" && (() => {
                    const q = catSearch[attr.name]?.toLowerCase();
                    const filteredVals = attr.unique_values.filter(
                      (val) => !q || val.toLowerCase().includes(q)
                    );
                    const currentSelected = Array.isArray(filters[attr.name]) ? (filters[attr.name] as string[]) : [];
                    return (
                      <div>
                        <div className="relative mb-1">
                          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={catSearch[attr.name] ?? ""}
                            onChange={(e) => setCatSearch({ ...catSearch, [attr.name]: e.target.value })}
                            placeholder="値を検索..."
                            className="input-field text-xs py-1 pl-6"
                          />
                        </div>
                        {q && filteredVals.length > 0 && (
                          <button
                            onClick={() => {
                              const merged = [...new Set([...currentSelected, ...filteredVals])];
                              updateFilter(attr.name, merged.length > 0 ? merged : undefined);
                            }}
                            className="text-xs text-nexus-600 dark:text-nexus-400 hover:underline mb-1"
                          >
                            検索結果を一括選択（{filteredVals.length}件）
                          </button>
                        )}
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                          {filteredVals.map((val) => {
                            const selected = currentSelected.includes(val);
                            return (
                              <button
                                key={val}
                                onClick={() => {
                                  const next = selected
                                    ? currentSelected.filter((v) => v !== val)
                                    : [...currentSelected, val];
                                  updateFilter(attr.name, next.length > 0 ? next : undefined);
                                }}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                  selected
                                    ? "bg-nexus-500 text-white"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                              >
                                {val || "(空)"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* テキスト型 */}
                  {!isDate && attr.type === "text" && (
                    <input
                      type="text"
                      value={(filters[attr.name] as string) || ""}
                      onChange={(e) => updateFilter(attr.name, e.target.value || undefined)}
                      placeholder="検索..."
                      className="input-field text-xs py-1"
                    />
                  )}
                </div>
              );
            })
          )}

          {activeCount > 0 && (
            <button
              onClick={() => onChange({})}
              className="text-xs text-nexus-600 dark:text-nexus-400 hover:underline"
            >
              フィルタをリセット
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AttributeFilter;
