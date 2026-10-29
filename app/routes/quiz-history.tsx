import { useMemo, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import {
  CheckCircle2,
  Clock,
  Eye,
  FolderOpen,
  History,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import type { Route } from "./+types/quiz-history";
import { ConfirmModal } from "~/components/ConfirmModal";
import {
  calculateOverallHistoryStats,
  formatDuration,
} from "~/services/quizEngine";
import {
  clearAllQuizHistory,
  deleteQuizHistoryRecord,
  listQuizHistorySummaries,
} from "~/services/quizHistory.server";
import { listLocalExams } from "~/services/yamolCrawler.server";
import type { QuizHistorySummary, QuizMode } from "~/types/exam";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "歷史測驗紀錄 | 阿摩線上測驗離線系統" },
    {
      name: "description",
      content: "檢視歷次模擬考與單題練習成績趨勢、作答耗時統計與錯題重練",
    },
  ];
}

export async function loader() {
  const [records, localExams] = await Promise.all([
    listQuizHistorySummaries(),
    listLocalExams(),
  ]);
  return {
    records,
    localExamIds: localExams.map((e) => e.examId),
  };
}

type ActionResponse =
  | { intent: "delete"; ok: true; recordId: string }
  | { intent: "clear_all"; ok: true; deletedCount: number }
  | { intent: string; ok: false; error: string };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResponse> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "delete") {
      const recordId = String(formData.get("recordId") || "");
      await deleteQuizHistoryRecord(recordId);
      return { intent: "delete", ok: true, recordId };
    }

    if (intent === "clear_all") {
      const deletedCount = await clearAllQuizHistory();
      return { intent: "clear_all", ok: true, deletedCount };
    }

    return { intent, ok: false, error: "未知的操作指令" };
  } catch (err) {
    return {
      intent,
      ok: false,
      error: err instanceof Error ? err.message : "處理紀錄操作時發生錯誤",
    };
  }
}

type ModeFilter = "ALL" | QuizMode;

function formatCompletedTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function QuizHistoryPage({ loaderData }: Route.ComponentProps) {
  const { records, localExamIds } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<ActionResponse>();

  const selectedExamId = searchParams.get("examId") ?? "ALL";
  const [modeFilter, setModeFilter] = useState<ModeFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [recordToDelete, setRecordToDelete] =
    useState<QuizHistorySummary | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  const isMutating = fetcher.state !== "idle";

  const localExamIdSet = useMemo(() => new Set(localExamIds), [localExamIds]);

  // 從紀錄中彙整考卷選單清單
  const examOptions = useMemo(() => {
    const map = new Map<
      string,
      { examId: string; title: string; count: number }
    >();
    for (const r of records) {
      const existing = map.get(r.examId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(r.examId, {
          examId: r.examId,
          title: r.examTitle,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [records]);

  const filteredRecords = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return records.filter((rec) => {
      if (selectedExamId !== "ALL" && rec.examId !== selectedExamId) {
        return false;
      }
      if (modeFilter !== "ALL" && rec.mode !== modeFilter) {
        return false;
      }
      if (!kw) return true;
      return (
        rec.examTitle.toLowerCase().includes(kw) ||
        rec.categoryTitle.toLowerCase().includes(kw) ||
        rec.examId.includes(kw)
      );
    });
  }, [records, selectedExamId, modeFilter, searchKeyword]);

  const overviewStats = useMemo(
    () => calculateOverallHistoryStats(filteredRecords),
    [filteredRecords]
  );

  const handleExamFilterChange = (nextExamId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextExamId === "ALL") {
      next.delete("examId");
    } else {
      next.set("examId", nextExamId);
    }
    setSearchParams(next, { replace: true });
  };

  const handleConfirmDeleteSingle = () => {
    if (!recordToDelete) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("recordId", recordToDelete.recordId);
    setRecordToDelete(null);
    fetcher.submit(formData, { method: "post" });
  };

  const handleConfirmClearAll = () => {
    const formData = new FormData();
    formData.append("intent", "clear_all");
    setShowClearAllModal(false);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-16">
      {/* 標題與清空按鈕 */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 dark:text-slate-100">
            <History className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            歷史測驗紀錄
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            自動保存於本地的模擬考與單題練習作答紀錄，隨時回顧錯題解析或重練弱點題目。
          </p>
        </div>

        {records.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearAllModal(true)}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:self-auto dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空全部紀錄
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <History className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
            尚無任何歷史測驗紀錄
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            從「本地題庫」任選一份考卷完成單題練習或模擬測驗交卷後，系統會自動將成績、各題耗時與作答明細保存在本地。
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <FolderOpen className="h-4 w-4" />
            前往本地題庫開始刷題
          </Link>
        </div>
      ) : (
        <>
          {/* 頂部統計指標網格 */}
          <section
            aria-label="測驗統計總覽"
            className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  測驗紀錄次數
                </span>
                <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                {overviewStats.totalSessions}
                <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  次
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                模擬考 {overviewStats.mockSessions} 次 · 練習{" "}
                {overviewStats.practiceSessions} 次
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  平均測驗得分
                </span>
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              <p
                className={`mt-2 text-2xl font-extrabold ${
                  overviewStats.averageScore >= 70
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {overviewStats.averageScore}
                <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  分
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                依目前篩選範圍計算平均
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  累計答題正確率
                </span>
                <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                {overviewStats.overallAccuracyPercent}%
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                答對 {overviewStats.totalCorrect} /{" "}
                {overviewStats.totalQuestions} 題
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  累計專注耗時
                </span>
                <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="mt-2 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatDuration(overviewStats.totalElapsedMs)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                歷次思考作答時間總計
              </p>
            </div>
          </section>

          {/* 篩選與搜尋工具列 */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={selectedExamId}
                onChange={(e) => handleExamFilterChange(e.target.value)}
                aria-label="依考卷篩選歷史紀錄"
                className="max-w-xs truncate rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-400"
              >
                <option value="ALL">全部考卷 ({records.length} 筆紀錄)</option>
                {examOptions.map((opt) => (
                  <option key={opt.examId} value={opt.examId}>
                    #{opt.examId} {opt.title} ({opt.count} 次)
                  </option>
                ))}
              </select>

              {selectedExamId !== "ALL" && (
                <button
                  type="button"
                  onClick={() => handleExamFilterChange("ALL")}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                >
                  <X className="h-3.5 w-3.5" />
                  清除單卷篩選
                </button>
              )}

              <div
                role="group"
                aria-label="測驗模式篩選"
                className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
              >
                {(
                  [
                    { id: "ALL", label: "全部模式" },
                    { id: "mock", label: "模擬考" },
                    { id: "practice", label: "單題練習" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModeFilter(item.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      modeFilter === item.id
                        ? "bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="search"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜尋考卷名稱或科目..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
              />
            </div>
          </div>

          {/* 紀錄清單 */}
          {filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              沒有符合目前篩選條件的歷史測驗紀錄。
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredRecords.map((rec) => {
                const isExamAvailable = localExamIdSet.has(rec.examId);
                const retryCount = rec.wrongQuestionIds.length;
                const scoreColorClass =
                  rec.summary.score >= 80
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : rec.summary.score >= 60
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300"
                      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300";

                return (
                  <article
                    key={rec.recordId}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-slate-300 lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    <div className="flex min-w-0 items-start gap-4 sm:items-center">
                      {/* 分數方牌 */}
                      <div
                        className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border ${scoreColorClass}`}
                      >
                        <span className="text-xl leading-none font-extrabold">
                          {rec.summary.score}
                        </span>
                        <span className="mt-1 text-[11px] font-semibold opacity-80">
                          分
                        </span>
                      </div>

                      {/* 考卷與作答統計摘要 */}
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${
                              rec.mode === "mock"
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {rec.mode === "mock" ? (
                              <Timer className="h-3 w-3" />
                            ) : (
                              <Sparkles className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            )}
                            {rec.mode === "mock" ? "模擬考" : "單題練習"}
                          </span>

                          {rec.isRetryWrongOnly && (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              錯題重練
                            </span>
                          )}

                          {rec.isAutoSubmittedByTimeout && (
                            <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              時間到交卷
                            </span>
                          )}

                          <span className="text-slate-500 dark:text-slate-400">
                            {rec.categoryTitle} · #{rec.examId}
                          </span>

                          <span className="text-slate-400 dark:text-slate-500">
                            · {formatCompletedTime(rec.completedAt)}
                          </span>
                        </div>

                        <Link
                          to={`/history/${rec.recordId}`}
                          className="block truncate text-base font-bold text-slate-900 transition hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                        >
                          {rec.examTitle}
                        </Link>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            答對 {rec.summary.correctCount} /{" "}
                            {rec.summary.totalQuestions} 題
                          </span>
                          {rec.summary.wrongCount > 0 && (
                            <span className="font-medium text-rose-600 dark:text-rose-400">
                              答錯 {rec.summary.wrongCount} 題
                            </span>
                          )}
                          {rec.summary.unansweredCount > 0 && (
                            <span>未答 {rec.summary.unansweredCount} 題</span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            總耗時 {formatDuration(
                              rec.summary.totalElapsedMs
                            )}{" "}
                            （平均{" "}
                            {formatDuration(rec.summary.averageElapsedMs)}
                            ／題）
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 右側操作按鈕 */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 self-end lg:self-center">
                      {retryCount > 0 && isExamAvailable && (
                        <Link
                          to={`/exams/${rec.examId}/quiz?retryRecord=${rec.recordId}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          重練錯題 ({retryCount})
                        </Link>
                      )}

                      <Link
                        to={`/history/${rec.recordId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-indigo-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        檢視檢討
                      </Link>

                      <button
                        type="button"
                        onClick={() => setRecordToDelete(rec)}
                        aria-label="刪除此筆測驗紀錄"
                        title="刪除此筆測驗紀錄"
                        className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 單筆紀錄刪除確認 */}
      <ConfirmModal
        open={Boolean(recordToDelete)}
        title="確定要刪除此筆測驗紀錄嗎？"
        description={
          recordToDelete
            ? `即將刪除「${recordToDelete.examTitle}」於 ${formatCompletedTime(recordToDelete.completedAt)} 的測驗紀錄（得分 ${recordToDelete.summary.score} 分）。此操作無法復原。`
            : ""
        }
        confirmLabel="確定刪除"
        isLoading={isMutating}
        onConfirm={handleConfirmDeleteSingle}
        onClose={() => setRecordToDelete(null)}
      />

      {/* 清空全部紀錄確認 */}
      <ConfirmModal
        open={showClearAllModal}
        title="確定要清空所有歷史測驗紀錄嗎？"
        description={`即將永久刪除本地全部 ${records.length} 筆歷史測驗紀錄（不會影響已下載的本地考卷檔案）。此操作無法復原。`}
        confirmLabel="確定全部清空"
        isLoading={isMutating}
        onConfirm={handleConfirmClearAll}
        onClose={() => setShowClearAllModal(false)}
      />
    </main>
  );
}
