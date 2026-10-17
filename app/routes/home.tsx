import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileJson,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Route } from "./+types/home";
import { ConfirmModal } from "~/components/ConfirmModal";
import {
  deleteLocalExam,
  downloadMultipleExams,
  exploreExamByInput,
  listLocalExams,
} from "~/services/yamolCrawler.server";
import type { ExamExploreResult, ExamSummary } from "~/types/exam";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "題庫管理中心 | 阿摩線上測驗離線系統" },
    {
      name: "description",
      content: "匯入阿摩線上測驗考卷、探索同科目歷屆試題並管理本地離線題庫",
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

export default function Home({ loaderData }: Route.ComponentProps) {
  const { exams } = loaderData;

  const exploreFetcher = useFetcher<ActionResponse>();
  const downloadFetcher = useFetcher<ActionResponse>();
  const deleteFetcher = useFetcher<ActionResponse>();

  const [queryInput, setQueryInput] = useState("https://yamol.tw/exam/140603");
  const [showRelatedList, setShowRelatedList] = useState(false);
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<Set<string>>(
    new Set()
  );
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [examToDelete, setExamToDelete] = useState<ExamSummary | null>(null);

  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const isExploring = exploreFetcher.state !== "idle";
  const isDownloading = downloadFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";

  const downloadedIdSet = useMemo(
    () => new Set(exams.map((e) => e.examId)),
    [exams]
  );

  const exploreResult =
    exploreFetcher.data?.intent === "explore" && exploreFetcher.data.ok
      ? exploreFetcher.data.exploreResult
      : null;

  // 同步全選 Checkbox 的 indeterminate 狀態
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

  // 根據搜尋與科目篩選本地考卷，並依科目分組
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
      const matchKeyword =
        !keyword ||
        exam.title.toLowerCase().includes(keyword) ||
        exam.examId.includes(keyword) ||
        exam.categoryTitle.toLowerCase().includes(keyword);
      return matchCategory && matchKeyword;
    });

    const groups = new Map<string, ExamSummary[]>();
    for (const exam of filtered) {
      const cat = exam.categoryTitle || "未分類科目";
      const list = groups.get(cat) ?? [];
      list.push(exam);
      groups.set(cat, list);
    }
    return Array.from(groups.entries());
  }, [exams, searchKeyword, selectedCategory]);

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

  const handleConfirmDelete = () => {
    if (!examToDelete) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("examId", examToDelete.examId);
    setExamToDelete(null);
    deleteFetcher.submit(formData, { method: "post" });
  };

  const isTargetDownloaded = exploreResult
    ? downloadedIdSet.has(exploreResult.targetExam.examId)
    : false;

  const undownloadedRelatedCount = relatedExams.filter(
    (r) => !downloadedIdSet.has(r.examId)
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                阿摩線上測驗 — 離線題庫與刷題系統
              </h1>
              <p className="text-xs text-slate-500">
                支援考卷探索、同科目批次離線下載、考卷閱覽與模擬測驗
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
              <Layers className="h-3.5 w-3.5" />
              本地題庫：{exams.length} 份考卷
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 pt-8">
        {/* 第一區塊：考卷匯入與同科目探索 */}
        <section
          aria-labelledby="import-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2
                id="import-heading"
                className="flex items-center gap-2 text-base font-bold text-slate-900"
              >
                <Download className="h-5 w-5 text-indigo-600" />
                考卷匯入（探索與離線下載）
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                輸入阿摩考卷網址（如{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  https://yamol.tw/exam/140603
                </code>
                ）或考卷 ID，系統會先探索考卷資訊並查詢同科目的其他歷屆試卷。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQueryInput("https://yamol.tw/exam/140603")}
              className="inline-flex items-center gap-1 self-start rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 sm:self-auto"
            >
              <Sparkles className="h-3.5 w-3.5" />
              帶入 iPAS 資安初級範例 (#140603)
            </button>
          </div>

          <exploreFetcher.Form
            method="post"
            onSubmit={() => {
              setSelectedRelatedIds(new Set());
              setShowRelatedList(false);
            }}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <input type="hidden" name="intent" value="explore" />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="query"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="請輸入考卷網址 (https://yamol.tw/exam/140603) 或考卷編號 (140603)..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
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
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              ❌ {exploreFetcher.data.error}
            </div>
          )}

          {downloadFetcher.data && !downloadFetcher.data.ok && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              ❌ {downloadFetcher.data.error}
            </div>
          )}

          {/* 下載成功提示 */}
          {downloadFetcher.data?.intent === "download" &&
            downloadFetcher.data.ok && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  成功下載並離線保存 {downloadFetcher.data.downloadedCount}{" "}
                  份考卷（含題目內附圖）！
                  {downloadFetcher.data.failed.length > 0 &&
                    `（另有 ${downloadFetcher.data.failed.length} 份失敗）`}
                </span>
              </div>
            )}

          {/* 探索結果卡片 */}
          {exploreResult && (
            <div className="mt-5 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                      {exploreResult.targetExam.categoryTitle}
                    </span>
                    <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700">
                      #{exploreResult.targetExam.examId}
                    </span>
                    <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-700">
                      共 {exploreResult.targetExam.totalQuestions} 題
                    </span>
                    {isTargetDownloaded ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        已在本地題庫
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        尚未下載
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {exploreResult.targetExam.title}
                  </h3>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                  {isTargetDownloaded && (
                    <Link
                      to={`/exams/${exploreResult.targetExam.examId}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                    >
                      <BookOpen className="h-4 w-4 text-indigo-600" />
                      直接閱覽考卷
                    </Link>
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
                        {isTargetDownloaded
                          ? "重新下載覆蓋此考卷"
                          : "下載此考卷到本地"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 同科目其他試卷探索與多選批次下載 */}
              {relatedExams.length > 0 && (
                <div className="border-t border-indigo-200/60 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRelatedList((prev) => !prev)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 transition hover:text-indigo-900"
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
                          className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50"
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
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600">
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
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>
                            全選全部 ({selectedRelatedIds.size} /{" "}
                            {relatedExams.length})
                          </span>
                        </label>
                        <span>狀態</span>
                      </div>

                      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                        {relatedExams.map((rel) => {
                          const isRelDownloaded = downloadedIdSet.has(
                            rel.examId
                          );
                          const isChecked = selectedRelatedIds.has(rel.examId);
                          return (
                            <label
                              key={rel.examId}
                              className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${
                                isChecked ? "bg-indigo-50/40" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleRelatedId(rel.examId)}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                  <span className="font-medium text-slate-800">
                                    {rel.title}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-400">
                                    #{rel.examId}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {isRelDownloaded ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                    <CheckCircle2 className="h-3 w-3" />
                                    已下載
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
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

        {/* 第二區塊：本地考卷管理（依科目分類顯示） */}
        <section aria-labelledby="manage-heading" className="space-y-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2
                id="manage-heading"
                className="flex items-center gap-2 text-base font-bold text-slate-900"
              >
                <FolderOpen className="h-5 w-5 text-indigo-600" />
                本地考卷管理
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                點選考卷可閱覽完整試題與答案，或直接開啟單題練習／模擬測驗模式
              </p>
            </div>

            {/* 搜尋與科目篩選器 */}
            {exams.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="篩選科目分類"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">所有科目分類 ({categories.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜尋考卷名稱或 ID..."
                    className="rounded-xl border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {exams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FolderOpen className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-800">
                目前本地尚無已下載的考卷
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                請由上方「考卷匯入」輸入阿摩考卷網址（例如預設的 140603）並點擊「探索考卷」下載。
              </p>
            </div>
          ) : groupedExams.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              找不到符合篩選條件的本地考卷。
            </div>
          ) : (
            <div className="space-y-6">
              {groupedExams.map(([categoryTitle, categoryExams]) => (
                <div
                  key={categoryTitle}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs"
                >
                  {/* 科目分類標頭 */}
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {categoryTitle}
                      </h3>
                    </div>
                    <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {categoryExams.length} 份考卷
                    </span>
                  </div>

                  {/* 該科目下的考卷列表 */}
                  <div className="divide-y divide-slate-100">
                    {categoryExams.map((exam) => (
                      <div
                        key={exam.examId}
                        className="flex flex-col justify-between gap-4 px-5 py-4 transition hover:bg-slate-50/70 lg:flex-row lg:items-center"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                              #{exam.examId}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {exam.totalQuestions} 題
                            </span>
                            <span className="text-xs text-slate-400">
                              下載於{" "}
                              {new Date(exam.downloadedAt).toLocaleDateString(
                                "zh-TW"
                              )}
                            </span>
                          </div>

                          <Link
                            to={`/exams/${exam.examId}`}
                            className="block text-sm font-bold text-slate-900 transition hover:text-indigo-600"
                          >
                            {exam.title}
                          </Link>
                        </div>

                        {/* 操作按鈕群 */}
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Link
                            to={`/exams/${exam.examId}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700"
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

                          <a
                            href={`/api/exams/${exam.examId}/export`}
                            download={`exam_${exam.examId}.json`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                            title="匯出考卷 JSON 檔案"
                          >
                            <FileJson className="h-3.5 w-3.5" />
                            匯出
                          </a>

                          <a
                            href={exam.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="在阿摩開啟原始頁面"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => setExamToDelete(exam)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            title="刪除此本地考卷"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 刪除確認 Modal */}
      <ConfirmModal
        open={Boolean(examToDelete)}
        title="確定要刪除此本地考卷嗎？"
        description={
          examToDelete
            ? `即將從本地題庫移除「${examToDelete.title}」(#${examToDelete.examId}) 以及其離線圖片檔案。刪除後仍可隨時重新從阿摩匯入。`
            : ""
        }
        confirmLabel="確定刪除"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setExamToDelete(null)}
      />
    </div>
  );
}
