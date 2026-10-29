import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import {
  BookOpen,
  Download,
  ExternalLink,
  FileJson,
  FolderOpen,
  History,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Trash2,
  Trophy,
} from "lucide-react";
import type { Route } from "./+types/home";
import { ConfirmModal } from "~/components/ConfirmModal";
import { aggregateExamHistoryStats } from "~/services/quizEngine";
import { listQuizHistorySummaries } from "~/services/quizHistory.server";
import {
  deleteLocalExam,
  listLocalExams,
} from "~/services/yamolCrawler.server";
import type { ExamSummary } from "~/types/exam";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "本地題庫管理 | 阿摩線上測驗離線系統" },
    {
      name: "description",
      content:
        "依科目分類瀏覽與管理本地離線考卷、檢視各卷測驗表現並開啟刷題練習",
    },
  ];
}

export async function loader() {
  const [exams, historySummaries] = await Promise.all([
    listLocalExams(),
    listQuizHistorySummaries(),
  ]);
  const historyStatsMap = aggregateExamHistoryStats(historySummaries);

  return {
    exams,
    historyStatsMap,
    totalQuizSessions: historySummaries.length,
  };
}

type ActionResponse =
  | {
      intent: "delete";
      ok: true;
      deletedExamId: string;
    }
  | {
      intent: string;
      ok: false;
      error: string;
    };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResponse> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "delete") {
      const examId = String(formData.get("examId") || "");
      await deleteLocalExam(examId);
      return { intent: "delete", ok: true, deletedExamId: examId };
    }

    return { intent, ok: false, error: "未知的操作指令" };
  } catch (err) {
    return {
      intent,
      ok: false,
      error: err instanceof Error ? err.message : "處理請求時發生錯誤",
    };
  }
}

type PracticeStatusFilter = "ALL" | "PRACTICED" | "UNPRACTICED";

interface OpenMenuState {
  exam: ExamSummary;
  top: number;
  right: number;
  openUpward: boolean;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { exams, historyStatsMap, totalQuizSessions } = loaderData;
  const deleteFetcher = useFetcher<ActionResponse>();

  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [practiceStatus, setPracticeStatus] =
    useState<PracticeStatusFilter>("ALL");
  const [examToDelete, setExamToDelete] = useState<ExamSummary | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);

  const actionPanelRef = useRef<HTMLDivElement>(null);
  const isDeleting = deleteFetcher.state !== "idle";

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const exam of exams) {
      set.add(exam.categoryTitle || "未分類科目");
    }
    return Array.from(set);
  }, [exams]);

  const groupedExams = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = exams.filter((exam) => {
      const matchCategory =
        selectedCategory === "ALL" || exam.categoryTitle === selectedCategory;
      if (!matchCategory) return false;

      const hasPracticed = Boolean(historyStatsMap[exam.examId]);
      if (practiceStatus === "PRACTICED" && !hasPracticed) return false;
      if (practiceStatus === "UNPRACTICED" && hasPracticed) return false;

      if (!keyword) return true;
      return (
        exam.title.toLowerCase().includes(keyword) ||
        exam.examId.includes(keyword) ||
        exam.categoryTitle.toLowerCase().includes(keyword)
      );
    });

    const groups = new Map<string, ExamSummary[]>();
    for (const exam of filtered) {
      const cat = exam.categoryTitle || "未分類科目";
      const list = groups.get(cat) ?? [];
      list.push(exam);
      groups.set(cat, list);
    }
    return Array.from(groups.entries());
  }, [exams, searchKeyword, selectedCategory, practiceStatus, historyStatsMap]);

  // 處理更多操作浮動面板的外部點擊、捲動與 Esc 關閉
  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (actionPanelRef.current?.contains(target)) return;
      if (target.closest(`[data-menu-trigger="${openMenu.exam.examId}"]`)) {
        return;
      }
      setOpenMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
      }
    };

    const handleScrollOrResize = () => {
      setOpenMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openMenu]);

  const handleToggleActionMenu = (
    exam: ExamSummary,
    buttonEl: HTMLButtonElement
  ) => {
    if (openMenu?.exam.examId === exam.examId) {
      setOpenMenu(null);
      return;
    }

    const rect = buttonEl.getBoundingClientRect();
    const estimatedMenuHeight = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward =
      spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    setOpenMenu({
      exam,
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      right: Math.max(12, window.innerWidth - rect.right),
      openUpward,
    });
  };

  const handleConfirmDelete = () => {
    if (!examToDelete) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("examId", examToDelete.examId);
    setExamToDelete(null);
    deleteFetcher.submit(formData, { method: "post" });
  };

  const activeMenuStats = openMenu
    ? historyStatsMap[openMenu.exam.examId]
    : undefined;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-16">
      {/* 頁面頂部標題與匯入快捷按鈕 */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 dark:text-slate-100">
            <FolderOpen className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            本地題庫管理
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {categories.length} 個科目分類 · {exams.length} 份離線考卷
            {totalQuizSessions > 0 && ` · 累計 ${totalQuizSessions} 次測驗紀錄`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {totalQuizSessions > 0 && (
            <Link
              to="/history"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              歷史測驗紀錄 ({totalQuizSessions})
            </Link>
          )}
          <Link
            to="/import"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            匯入新考卷
          </Link>
        </div>
      </div>

      {/* 篩選與搜尋工具列 */}
      {exams.length > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="篩選科目分類"
              className="max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-400"
            >
              <option value="ALL">所有科目分類 ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="練習狀態篩選"
              className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
            >
              {(
                [
                  { id: "ALL", label: "全部" },
                  { id: "UNPRACTICED", label: "尚未測驗" },
                  { id: "PRACTICED", label: "已測驗過" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPracticeStatus(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    practiceStatus === tab.id
                      ? "bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-indigo-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜尋考卷名稱、科目或編號..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
            />
          </div>
        </div>
      )}

      {/* 考卷分類列表或空狀態 */}
      {exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Download className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
            目前本地尚無已下載的考卷
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            請前往「匯入與探索考卷」輸入阿摩考卷網址或編號（例如預設範例
            #140603），即可將完整題目與附圖保存至本地離線練習。
          </p>
          <Link
            to="/import"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            前往匯入第一份考卷
          </Link>
        </div>
      ) : groupedExams.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          找不到符合目前篩選條件的本地考卷。
        </div>
      ) : (
        <div className="space-y-6">
          {groupedExams.map(([categoryTitle, categoryExams]) => (
            <section
              key={categoryTitle}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            >
              {/* 科目分類標頭 */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {categoryTitle}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {categoryExams.length} 份考卷
                </span>
              </div>

              {/* 該科目下的考卷列表 */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {categoryExams.map((exam) => {
                  const stats = historyStatsMap[exam.examId];
                  const isMenuOpen = openMenu?.exam.examId === exam.examId;

                  return (
                    <div
                      key={exam.examId}
                      className="flex flex-col justify-between gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                            #{exam.examId}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {exam.totalQuestions} 題
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            下載於{" "}
                            {new Date(exam.downloadedAt).toLocaleDateString(
                              "zh-TW"
                            )}
                          </span>

                          {stats && (
                            <Link
                              to={`/history?examId=${exam.examId}`}
                              title="點擊查看此考卷的歷史測驗紀錄"
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition ${
                                stats.latestScore >= 70
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                              }`}
                            >
                              <Trophy className="h-3 w-3" aria-hidden="true" />
                              最近 {stats.latestScore} 分
                              {stats.attemptCount > 1 &&
                                ` · 最高 ${stats.bestScore} 分`}
                              <span className="opacity-75">
                                ({stats.attemptCount} 次)
                              </span>
                            </Link>
                          )}
                        </div>

                        <Link
                          to={`/exams/${exam.examId}`}
                          className="block text-sm font-bold text-slate-900 transition hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                        >
                          {exam.title}
                        </Link>
                      </div>

                      {/* 精簡操作按鈕群：閱覽 + 刷題 + 更多操作 (⋯) */}
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          to={`/exams/${exam.examId}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          閱覽考卷
                        </Link>

                        <Link
                          to={`/exams/${exam.examId}/quiz`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-indigo-700"
                        >
                          <Play className="h-3.5 w-3.5" />
                          開始刷題
                        </Link>

                        <button
                          type="button"
                          data-menu-trigger={exam.examId}
                          aria-label={`「${exam.title}」更多操作`}
                          aria-expanded={isMenuOpen}
                          onClick={(e) =>
                            handleToggleActionMenu(exam, e.currentTarget)
                          }
                          className={`inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition ${
                            isMenuOpen
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
                              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                          }`}
                          title="更多操作（歷史紀錄、匯出、原頁、刪除）"
                        >
                          <MoreHorizontal
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 更多操作浮動按鈕面板 (使用 fixed 定位避免被分類卡片 overflow-hidden 裁切) */}
      {openMenu && (
        <div
          ref={actionPanelRef}
          style={{
            position: "fixed",
            top: openMenu.openUpward ? undefined : `${openMenu.top}px`,
            bottom: openMenu.openUpward
              ? `${window.innerHeight - openMenu.top}px`
              : undefined,
            right: `${openMenu.right}px`,
          }}
          className="z-40 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {activeMenuStats && (
            <Link
              to={`/history?examId=${openMenu.exam.examId}`}
              onClick={() => setOpenMenu(null)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              此卷歷史紀錄 ({activeMenuStats.attemptCount})
            </Link>
          )}

          <a
            href={`/api/exams/${openMenu.exam.examId}/export`}
            download={`exam_${openMenu.exam.examId}.json`}
            onClick={() => setOpenMenu(null)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileJson className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            匯出考卷 JSON
          </a>

          <a
            href={openMenu.exam.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpenMenu(null)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            開啟阿摩原始頁面
          </a>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            onClick={() => {
              const target = openMenu.exam;
              setOpenMenu(null);
              setExamToDelete(target);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            刪除此本地考卷
          </button>
        </div>
      )}

      {/* 刪除確認 Modal */}
      <ConfirmModal
        open={Boolean(examToDelete)}
        title="確定要刪除此本地考卷嗎？"
        description={
          examToDelete
            ? `即將從本地題庫移除「${examToDelete.title}」(#${examToDelete.examId}) 以及其離線圖片檔案。已保存的歷史測驗成績仍會保留，刪除後亦可隨時重新從阿摩匯入。`
            : ""
        }
        confirmLabel="確定刪除"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setExamToDelete(null)}
      />
    </main>
  );
}
