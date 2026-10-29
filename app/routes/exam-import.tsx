import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FolderOpen,
  Loader2,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import type { Route } from "./+types/exam-import";
import {
  downloadMultipleExams,
  exploreExamByInput,
  listLocalExams,
} from "~/services/yamolCrawler.server";
import type { ExamExploreResult } from "~/types/exam";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "匯入與探索考卷 | 阿摩線上測驗離線系統" },
    {
      name: "description",
      content:
        "輸入阿摩線上測驗網址或考卷編號，探索同科目歷屆試卷並批次離線下載",
    },
  ];
}

export async function loader() {
  const exams = await listLocalExams();
  return { exams };
}

type ActionResponse =
  | {
      intent: "explore";
      ok: true;
      exploreResult: ExamExploreResult;
    }
  | {
      intent: "download";
      ok: true;
      downloadedCount: number;
      failed: Array<{ examId: string; error: string }>;
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
    if (intent === "explore") {
      const query = String(formData.get("query") || "");
      const exploreResult = await exploreExamByInput(query);
      return { intent: "explore", ok: true, exploreResult };
    }

    if (intent === "download") {
      const examIdsRaw = formData.getAll("examIds").map(String).filter(Boolean);
      if (examIdsRaw.length === 0) {
        return {
          intent: "download",
          ok: false,
          error: "請至少選擇一份要下載的考卷",
        };
      }
      const { succeeded, failed } = await downloadMultipleExams(examIdsRaw);
      return {
        intent: "download",
        ok: true,
        downloadedCount: succeeded.length,
        failed,
      };
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

export default function ExamImport({ loaderData }: Route.ComponentProps) {
  const { exams } = loaderData;
  const [searchParams] = useSearchParams();
  const initialExamId = searchParams.get("examId");

  const exploreFetcher = useFetcher<ActionResponse>();
  const downloadFetcher = useFetcher<ActionResponse>();

  const [queryInput, setQueryInput] = useState(() =>
    initialExamId
      ? `https://yamol.tw/exam/${initialExamId}`
      : "https://yamol.tw/exam/140603"
  );
  const [showRelatedList, setShowRelatedList] = useState(true);
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<Set<string>>(
    new Set()
  );

  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const isExploring = exploreFetcher.state !== "idle";
  const isDownloading = downloadFetcher.state !== "idle";

  const downloadedIdSet = useMemo(
    () => new Set(exams.map((e) => e.examId)),
    [exams]
  );

  const exploreResult =
    exploreFetcher.data?.intent === "explore" && exploreFetcher.data.ok
      ? exploreFetcher.data.exploreResult
      : null;

  const relatedExams = useMemo(
    () => exploreResult?.relatedExams ?? [],
    [exploreResult]
  );

  useEffect(() => {
    const checkbox = selectAllCheckboxRef.current;
    if (!checkbox) return;
    const total = relatedExams.length;
    const checkedCount = selectedRelatedIds.size;
    checkbox.indeterminate = checkedCount > 0 && checkedCount < total;
  }, [relatedExams.length, selectedRelatedIds.size]);

  const toggleRelatedId = (examId: string) => {
    setSelectedRelatedIds((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) {
        next.delete(examId);
      } else {
        next.add(examId);
      }
      return next;
    });
  };

  const handleSelectAllRelated = (checked: boolean) => {
    if (checked) {
      setSelectedRelatedIds(new Set(relatedExams.map((r) => r.examId)));
    } else {
      setSelectedRelatedIds(new Set());
    }
  };

  const handleSelectAllUndownloaded = () => {
    const undownloaded = relatedExams
      .filter((r) => !downloadedIdSet.has(r.examId))
      .map((r) => r.examId);
    setSelectedRelatedIds(new Set(undownloaded));
  };

  const handleDownloadSingle = (examId: string) => {
    const formData = new FormData();
    formData.append("intent", "download");
    formData.append("examIds", examId);
    downloadFetcher.submit(formData, { method: "post" });
  };

  const handleDownloadSelectedRelated = () => {
    if (selectedRelatedIds.size === 0) return;
    const formData = new FormData();
    formData.append("intent", "download");
    for (const id of selectedRelatedIds) {
      formData.append("examIds", id);
    }
    downloadFetcher.submit(formData, { method: "post" });
  };

  const isTargetDownloaded = exploreResult
    ? downloadedIdSet.has(exploreResult.targetExam.examId)
    : false;

  const undownloadedRelatedCount = relatedExams.filter(
    (r) => !downloadedIdSet.has(r.examId)
  ).length;

  const recentDownloadedExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
      .slice(0, 5);
  }, [exams]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8 pb-16">
      {/* 頁面標題列 */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 dark:text-slate-100">
            <Download className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            匯入與探索考卷
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            從阿摩線上測驗探索指定考卷與同科目歷屆試題，並自動將題目與附圖離線保存至本地。
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 sm:self-auto dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          返回本地題庫 ({exams.length} 份)
        </Link>
      </div>

      {/* 探索與批次下載區塊 */}
      <section
        aria-labelledby="import-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2
              id="import-heading"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              輸入阿摩考卷網址或編號
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              例如{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                https://yamol.tw/exam/140603
              </code>{" "}
              或純編號{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                140603
              </code>
              ，系統會一併列出同科目相關試卷供批次勾選。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQueryInput("https://yamol.tw/exam/140603")}
            className="inline-flex items-center gap-1 self-start rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 sm:self-auto dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            帶入 iPAS 資安初級範例 (#140603)
          </button>
        </div>

        <exploreFetcher.Form
          method="post"
          onSubmit={() => {
            setSelectedRelatedIds(new Set());
            setShowRelatedList(true);
          }}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input type="hidden" name="intent" value="explore" />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              name="query"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="請輸入考卷網址 (https://yamol.tw/exam/140603) 或考卷編號 (140603)..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isExploring || !queryInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExploring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                探索查詢中...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                探索考卷
              </>
            )}
          </button>
        </exploreFetcher.Form>

        {/* 錯誤提示 */}
        {exploreFetcher.data && !exploreFetcher.data.ok && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            ❌ {exploreFetcher.data.error}
          </div>
        )}

        {downloadFetcher.data && !downloadFetcher.data.ok && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            ❌ {downloadFetcher.data.error}
          </div>
        )}

        {/* 下載成功提示 */}
        {downloadFetcher.data?.intent === "download" &&
          downloadFetcher.data.ok && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                成功下載並離線保存 {downloadFetcher.data.downloadedCount}{" "}
                份考卷（含題目內附圖）！
                {downloadFetcher.data.failed.length > 0 &&
                  `（另有 ${downloadFetcher.data.failed.length} 份失敗）`}
              </span>
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                前往本地題庫查看
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

        {/* 探索結果卡片 */}
        {exploreResult && (
          <div className="mt-5 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/25">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200">
                    {exploreResult.targetExam.categoryTitle}
                  </span>
                  <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    #{exploreResult.targetExam.examId}
                  </span>
                  <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    共 {exploreResult.targetExam.totalQuestions} 題
                  </span>
                  {isTargetDownloaded ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      已在本地題庫
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                      尚未下載
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {exploreResult.targetExam.title}
                </h3>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                {isTargetDownloaded && (
                  <>
                    <Link
                      to={`/exams/${exploreResult.targetExam.examId}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      閱覽考卷
                    </Link>
                    <Link
                      to={`/exams/${exploreResult.targetExam.examId}/quiz`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700"
                    >
                      <Play className="h-4 w-4" />
                      開始刷題
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  disabled={isDownloading}
                  onClick={() =>
                    handleDownloadSingle(exploreResult.targetExam.examId)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      下載處理中...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {isTargetDownloaded ? "重新下載覆蓋" : "下載此考卷到本地"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 同科目其他試卷探索與多選批次下載 */}
            {relatedExams.length > 0 && (
              <div className="border-t border-indigo-200/60 pt-4 dark:border-indigo-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRelatedList((prev) => !prev)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 transition hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                  >
                    {showRelatedList ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    發現同科目「{exploreResult.targetExam.categoryTitle}」另有{" "}
                    {relatedExams.length} 份相關試卷（未下載{" "}
                    {undownloadedRelatedCount} 份）— 點此
                    {showRelatedList ? "收合" : "展開勾選下載"}
                  </button>

                  {showRelatedList && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllUndownloaded}
                        className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                      >
                        勾選所有未下載 ({undownloadedRelatedCount})
                      </button>
                      <button
                        type="button"
                        disabled={
                          selectedRelatedIds.size === 0 || isDownloading
                        }
                        onClick={handleDownloadSelectedRelated}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        批次下載已勾選 ({selectedRelatedIds.size} 份)
                      </button>
                    </div>
                  )}
                </div>

                {showRelatedList && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          ref={selectAllCheckboxRef}
                          type="checkbox"
                          checked={
                            relatedExams.length > 0 &&
                            selectedRelatedIds.size === relatedExams.length
                          }
                          onChange={(e) =>
                            handleSelectAllRelated(e.target.checked)
                          }
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                        />
                        <span>
                          全選全部 ({selectedRelatedIds.size} /{" "}
                          {relatedExams.length})
                        </span>
                      </label>
                      <span>狀態</span>
                    </div>

                    <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                      {relatedExams.map((rel) => {
                        const isRelDownloaded = downloadedIdSet.has(rel.examId);
                        const isChecked = selectedRelatedIds.has(rel.examId);
                        return (
                          <label
                            key={rel.examId}
                            className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                              isChecked
                                ? "bg-indigo-50/40 dark:bg-indigo-950/30"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRelatedId(rel.examId)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                              />
                              <div>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {rel.title}
                                </span>
                                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                                  #{rel.examId}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isRelDownloaded ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  已下載
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  未下載
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 最近已匯入的考卷快速入口 */}
      {recentDownloadedExams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              最近下載至本地的考卷
            </h2>
            <Link
              to="/"
              className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              管理全部 {exams.length} 份考卷 →
            </Link>
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {recentDownloadedExams.map((exam) => (
              <div
                key={exam.examId}
                className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      #{exam.examId}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {exam.categoryTitle} · {exam.totalQuestions} 題
                    </span>
                  </div>
                  <Link
                    to={`/exams/${exam.examId}`}
                    className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                  >
                    {exam.title}
                  </Link>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/exams/${exam.examId}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    閱覽
                  </Link>
                  <Link
                    to={`/exams/${exam.examId}/quiz`}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                  >
                    刷題
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
