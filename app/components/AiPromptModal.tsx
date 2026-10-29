import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  X,
  Zap,
  GraduationCap,
} from "lucide-react";
import {
  type AiPromptQuestionContext,
  type AiPromptStyle,
  buildAiExplanationPrompt,
} from "~/services/aiPromptBuilder";
import styles from "~/styles/exam-viewer.module.css";
import type { OptionKey } from "~/types/exam";

const MODAL_OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];

interface AiPromptModalProps {
  context: AiPromptQuestionContext | null;
  onClose: () => void;
}

const STYLE_OPTIONS: {
  id: AiPromptStyle;
  label: string;
  desc: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "comprehensive",
    label: "完整詳解（推薦）",
    desc: "核心考點、各選項逐一破題勘誤、誘答陷阱對比與記憶口訣",
    icon: BookOpen,
  },
  {
    id: "concise",
    label: "重點速讀",
    desc: "2～3 句話直接破題＋各錯誤選項一句話勘誤，適合考前快速掃描",
    icon: Zap,
  },
  {
    id: "socratic",
    label: "深度教學＋延伸題",
    desc: "由淺入深講解背景原理，並請 AI 額外出一題同考點變形題讓你練習",
    icon: GraduationCap,
  },
];

export function AiPromptModal({ context, onClose }: AiPromptModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [style, setStyle] = useState<AiPromptStyle>("comprehensive");
  const [includeCrowdStats, setIncludeCrowdStats] = useState<boolean>(true);
  const [includeUserAttempt, setIncludeUserAttempt] = useState<boolean>(true);
  const [customEditState, setCustomEditState] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const open = context !== null;

  // 以當前題目識別碼隔離自訂編輯與複製狀態，切換題目時自動歸零而不需在 Effect 同步 setState
  const questionKey = context
    ? `${context.examTitle}-${context.questionNumber}-${context.userSelectedOption ?? "none"}`
    : "";

  const customEditedPrompt =
    customEditState?.key === questionKey ? customEditState.text : null;
  const copied = copiedKey !== null && copiedKey === questionKey;

  const setCustomEditedPrompt = (value: string | null) => {
    if (value === null) {
      setCustomEditState(null);
    } else {
      setCustomEditState({ key: questionKey, text: value });
    }
  };

  // 依據目前選項即時產生標準提示詞
  const generatedPrompt = useMemo(() => {
    if (!context) return "";
    return buildAiExplanationPrompt(context, {
      style,
      includeCrowdStats,
      includeUserAttempt,
    });
  }, [context, style, includeCrowdStats, includeUserAttempt]);

  const activePromptText = customEditedPrompt ?? generatedPrompt;

  // 控制原生 <dialog> 開關
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // 監聽關閉事件與不支援 closedby="any" 的瀏覽器背景點擊降級處理
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };
    dialog.addEventListener("close", handleClose);

    let handleBackdropClick: ((event: MouseEvent) => void) | undefined;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener("click", handleBackdropClick);
      }
    };
  }, [onClose]);

  const handleCopyPrompt = async (): Promise<boolean> => {
    if (!activePromptText) return false;
    try {
      await navigator.clipboard.writeText(activePromptText);
    } catch {
      // 降級複製方案
      const textarea = document.createElement("textarea");
      textarea.value = activePromptText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedKey(questionKey);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === questionKey ? null : prev));
    }, 2500);
    return true;
  };

  const handleCopyAndOpenAi = async (url: string) => {
    await handleCopyPrompt();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const hasUserAttemptInfo =
    context?.userSelectedOption !== undefined &&
    context?.userSelectedOption !== null;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      className={`${styles.modalDialog} m-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`}
    >
      {context && (
        <div className="flex max-h-[90vh] flex-col">
          {/* 頂部標題列 */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={titleId}
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    AI 解析提示詞 — 第 {context.questionNumber} 題
                  </h2>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    正解 ({context.answer})
                  </span>
                  {hasUserAttemptInfo &&
                    context.userSelectedOption !== context.answer && (
                      <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        您的選擇 ({context.userSelectedOption})
                      </span>
                    )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                  {context.categoryTitle} · 全站答對率{" "}
                  {Math.round(context.correctRate * 100)}%
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="關閉視窗"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 中間滾動內容區 */}
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* 解析風格選擇 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. 選擇希望 AI 回答的解析深度與風格
              </label>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
                {STYLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = style === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStyle(opt.id);
                        setCustomEditedPrompt(null);
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/40 dark:ring-indigo-500"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            isSelected
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        />
                        {opt.label}
                      </span>
                      <span className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 輔助資訊勾選列 */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-slate-700/80 dark:bg-slate-800/60">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                2. 附加精準化線索：
              </span>

              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeCrowdStats}
                  onChange={(e) => {
                    setIncludeCrowdStats(e.target.checked);
                    setCustomEditedPrompt(null);
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 dark:border-slate-600"
                />
                <span>
                  包含全站選答率與高誘答統計（幫助 AI 點出最多人選錯的陷阱）
                </span>
              </label>

              {context.userSelectedOption !== undefined && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeUserAttempt}
                    onChange={(e) => {
                      setIncludeUserAttempt(e.target.checked);
                      setCustomEditedPrompt(null);
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 dark:border-slate-600"
                  />
                  <span>
                    包含我的作答紀錄（請 AI 針對我選的選項加強盲點對比）
                  </span>
                </label>
              )}
            </div>

            {/* 若本題含有題幹附圖或選項附圖，顯示附圖預覽與複製圖片提示 */}
            {(() => {
              const optionImgEntries: Array<{
                optKey: OptionKey;
                src: string;
              }> = [];
              for (const k of MODAL_OPTION_KEYS) {
                for (const src of context.optionImages?.[k] ?? []) {
                  optionImgEntries.push({ optKey: k, src });
                }
              }
              const totalImgCount =
                context.images.length + optionImgEntries.length;
              if (totalImgCount === 0) return null;

              return (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-2">
                      <p className="font-semibold">
                        本題包含 {totalImgCount} 張附圖：建議在下方圖片按「右鍵
                        → 複製圖片」，與提示詞一併貼給 Gemini / ChatGPT！
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {context.images.map((imgSrc, idx) => (
                          <img
                            key={`stem-${idx}`}
                            src={imgSrc}
                            alt={`考題附圖 ${idx + 1}`}
                            className="max-h-32 rounded-lg border border-amber-300 bg-white object-contain p-1.5 dark:border-amber-700/60"
                          />
                        ))}
                        {optionImgEntries.map(({ optKey, src }, idx) => (
                          <div
                            key={`opt-${optKey}-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white p-1.5 dark:border-amber-700/60 dark:bg-slate-800"
                          >
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                              {optKey}
                            </span>
                            <img
                              src={src}
                              alt={`選項 (${optKey}) 附圖`}
                              className="max-h-24 rounded bg-white object-contain p-0.5"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 提示詞預覽與可編輯文字框 */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ai-prompt-textarea"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  3. 提示詞內容預覽（可直接在此微調或補充想問的問題）
                </label>
                {customEditedPrompt !== null && (
                  <button
                    type="button"
                    onClick={() => setCustomEditedPrompt(null)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <RotateCcw className="h-3 w-3" />
                    還原預設提示詞
                  </button>
                )}
              </div>

              <textarea
                id="ai-prompt-textarea"
                rows={11}
                value={activePromptText}
                onChange={(e) => setCustomEditedPrompt(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 font-mono text-xs leading-relaxed text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:focus:border-indigo-400 dark:focus:bg-slate-900"
              />
            </div>
          </div>

          {/* 底部操作列：一鍵複製 + 快速開啟各 AI 服務 */}
          <div className="flex flex-col justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                複製並前往：
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopyAndOpenAi("https://gemini.google.com/app")
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
              >
                Gemini
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleCopyAndOpenAi("https://chatgpt.com/")}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
              >
                ChatGPT
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleCopyAndOpenAi("https://claude.ai/new")}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
              >
                Claude
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs transition ${
                  copied
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    已複製到剪貼簿！
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    一鍵複製提示詞
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
