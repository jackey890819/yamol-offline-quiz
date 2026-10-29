import { useCallback, useMemo, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Flag,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { Route } from "./+types/quiz-history-detail";
import { AiPromptModal } from "~/components/AiPromptModal";
import { ConfirmModal } from "~/components/ConfirmModal";
import type { AiPromptQuestionContext } from "~/services/aiPromptBuilder";
import {
  formatDuration,
  reconstructPreparedQuestion,
} from "~/services/quizEngine";
import {
  deleteQuizHistoryRecord,
  getQuizHistoryRecord,
} from "~/services/quizHistory.server";
import { getLocalExam } from "~/services/yamolCrawler.server";
import styles from "~/styles/exam-viewer.module.css";
import type {
  DifficultyLevel,
  OptionKey,
  PreparedQuestion,
  QuizHistoryItemSnapshot,
} from "~/types/exam";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];

const DIFFICULTY_BADGE_STYLE: Record<DifficultyLevel, string> = {
  非常簡單:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
  簡單: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/60",
  適中: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60",
  困難: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
  非常困難:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
};

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.record?.examTitle ?? "測驗紀錄檢討";
  return [
    { title: `測驗檢討 — ${title} | 阿摩離線題庫` },
    {
      name: "description",
      content: `檢視 ${title} 的歷史測驗得分、逐題耗時與錯題解析`,
    },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const record = await getQuizHistoryRecord(params.recordId);
  if (!record) {
    throw new Response("找不到該筆歷史測驗紀錄，可能已被刪除。", {
      status: 404,
    });
  }

  const exam = await getLocalExam(record.examId);
  return { record, exam };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "delete") {
    await deleteQuizHistoryRecord(params.recordId);
    return redirect("/history");
  }

  return { ok: false };
}

type ReviewFilter = "all" | "wrong_or_unanswered" | "flagged";
type ReviewSort = "index" | "time_desc";

interface EnrichedHistoryEntry {
  snapshot: QuizHistoryItemSnapshot;
  preparedQuestion: PreparedQuestion | null;
}

export default function QuizHistoryDetail({
  loaderData,
}: Route.ComponentProps) {
  const { record, exam } = loaderData;
  const deleteFetcher = useFetcher();

  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [reviewSort, setReviewSort] = useState<ReviewSort>("index");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiPromptContext, setAiPromptContext] =
    useState<AiPromptQuestionContext | null>(null);

  const isDeleting = deleteFetcher.state !== "idle";

  const entries = useMemo<EnrichedHistoryEntry[]>(() => {
    const questionMap = new Map(
      (exam?.questions ?? []).map((q) => [q.id, q] as const)
    );

    return record.items.map((snapshot) => {
      const sourceQ = questionMap.get(snapshot.questionId);
      return {
        snapshot,
        preparedQuestion: sourceQ
          ? reconstructPreparedQuestion(sourceQ, snapshot)
          : null,
      };
    });
  }, [exam, record.items]);

  const flaggedCount = useMemo(
    () => record.items.filter((i) => i.isFlagged).length,
    [record.items]
  );

  const slowestEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => b.snapshot.elapsedMs - a.snapshot.elapsedMs)
      .slice(0, 3)
      .filter((e) => e.snapshot.elapsedMs > 0);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const filtered = entries.filter(({ snapshot }) => {
      if (reviewFilter === "wrong_or_unanswered") {
        return !snapshot.isCorrect;
      }
      if (reviewFilter === "flagged") {
        return snapshot.isFlagged;
      }
      return true;
    });

    if (reviewSort === "time_desc") {
      return [...filtered].sort(
        (a, b) => b.snapshot.elapsedMs - a.snapshot.elapsedMs
      );
    }
    return filtered;
  }, [entries, reviewFilter, reviewSort]);

  const openAiPrompt = useCallback(
    (q: PreparedQuestion, snapshot: QuizHistoryItemSnapshot) => {
      setAiPromptContext({
        examTitle: record.examTitle,
        categoryTitle: record.categoryTitle,
        examYear: record.examYear,
        questionNumber: q.displayIndex,
        originalQuestionNumber:
          record.questionOrder === "random" ? q.questionNumber : undefined,
        question: q.question,
        options: q.options,
        optionImages: q.optionImages,
        answer: q.answer,
        difficulty: q.difficulty,
        correctRate: q.correctRate,
        stats: q.stats,
        images: q.images,
        userSelectedOption: snapshot.selectedOption,
      });
    },
    [
      record.categoryTitle,
      record.examTitle,
      record.examYear,
      record.questionOrder,
    ]
  );

  const handleConfirmDelete = () => {
    const formData = new FormData();
    formData.append("intent", "delete");
    setShowDeleteConfirm(false);
    deleteFetcher.submit(formData, { method: "post" });
  };

  const completedAtFormatted = useMemo(() => {
    try {
      return new Date(record.completedAt).toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return record.completedAt;
    }
  }, [record.completedAt]);

  const wrongOrUnansweredTotal =
    record.summary.wrongCount + record.summary.unansweredCount;

  return (
    <div className="pb-20">
      {/* 頂部操作列 */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="h-4 w-4" />
            返回歷史測驗紀錄
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {exam && (
              <Link
                to={`/exams/${record.examId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                閱覽原考卷
              </Link>
            )}

            {exam && wrongOrUnansweredTotal > 0 && (
              <Link
                to={`/exams/${record.examId}/quiz?retryRecord=${record.recordId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-amber-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重練本次錯題 ({wrongOrUnansweredTotal} 題)
              </Link>
            )}

            {exam && (
              <Link
                to={`/exams/${record.examId}/quiz`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-indigo-700"
              >
                <Play className="h-3.5 w-3.5" />
                再測驗一次
              </Link>
            )}

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="刪除此筆紀錄"
              title="刪除此筆紀錄"
              className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 pt-8">
        {record.isAutoSubmittedByTimeout && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm font-semibold text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            此筆紀錄為模擬考規定時間歸零時由系統自動交卷結算。
          </div>
        )}

        {/* 成績與耗時總覽卡片 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-6 border-b border-slate-100 pb-6 md:flex-row md:items-center dark:border-slate-800">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                  {record.mode === "mock" ? "模擬考紀錄" : "單題練習紀錄"}
                </span>
                {record.isRetryWrongOnly && (
                  <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    錯題專項重練
                  </span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {record.categoryTitle} · #{record.examId}
                </span>
              </div>

              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {record.examTitle}
              </h1>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                測驗完成於 {completedAtFormatted} · 題目順序：
                {record.questionOrder === "random" ? "隨機打亂" : "依原題號"} ·
                選項順序：
                {record.optionOrder === "random" ? "隨機打亂" : "依原順序"}
              </p>
            </div>

            <div className="text-left md:text-right">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                測驗得分
              </span>
              <span
                className={`text-4xl font-extrabold ${
                  record.summary.score >= 70
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {record.summary.score}
                <span className="ml-1 text-base font-semibold">分</span>
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-xl bg-emerald-50/70 p-4 dark:bg-emerald-950/40">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                答對題數
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                {record.summary.correctCount}{" "}
                <span className="text-xs font-normal">
                  / {record.summary.totalQuestions}
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-rose-50/70 p-4 dark:bg-rose-950/40">
              <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
                答錯題數
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-200">
                {record.summary.wrongCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100/80 p-4 dark:bg-slate-800/70">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                未作答題數
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-200">
                {record.summary.unansweredCount}
              </p>
            </div>

            <div className="rounded-xl bg-indigo-50/70 p-4 dark:bg-indigo-950/40">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                總作答耗時
              </span>
              <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-indigo-200">
                {formatDuration(record.summary.totalElapsedMs)}
              </p>
            </div>

            <div className="rounded-xl bg-indigo-50/70 p-4 dark:bg-indigo-950/40">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                平均每題耗時
              </span>
              <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-slate-200">
                {formatDuration(record.summary.averageElapsedMs)}
              </p>
            </div>
          </div>

          {slowestEntries.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                最耗時題目排行：
              </span>
              {slowestEntries.map(({ snapshot }) => (
                <a
                  key={snapshot.questionId}
                  href={`#history-q-${snapshot.questionId}`}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                >
                  第 {snapshot.displayIndex} 題 (
                  {formatDuration(snapshot.elapsedMs)})
                </a>
              ))}
            </div>
          )}
        </section>

        {/* 若本地考卷檔案已被移除時的提示橫幅 */}
        {!exam && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="space-y-0.5">
              <p className="font-bold">
                ⚠️ 本地目前未找到考卷 #{record.examId} 的題目檔
              </p>
              <p className="text-xs opacity-90">
                下方仍可檢視逐題作答對錯與耗時快照；若想查看完整題幹與選項內容，可重新從阿摩匯入該考卷。
              </p>
            </div>
            <Link
              to={`/import?examId=${record.examId}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
            >
              <Download className="h-3.5 w-3.5" />
              重新匯入考卷 #{record.examId}
            </Link>
          </div>
        )}

        {/* 逐題檢討篩選與排序列 */}
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewFilter("all")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  reviewFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-indigo-600 dark:text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                全部題目 ({record.items.length})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter("wrong_or_unanswered")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  reviewFilter === "wrong_or_unanswered"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60"
                }`}
              >
                只看錯題與未答 ({wrongOrUnansweredTotal})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter("flagged")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  reviewFilter === "flagged"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60"
                }`}
              >
                只看標記不確定 ({flaggedCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                排序：
              </span>
              <select
                value={reviewSort}
                onChange={(e) => setReviewSort(e.target.value as ReviewSort)}
                aria-label="檢討題目排序方式"
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-400"
              >
                <option value="index">依測驗題號順序</option>
                <option value="time_desc">依各題耗時（由多到少）</option>
              </select>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              🎉 沒有符合此篩選條件的題目！
            </div>
          ) : (
            filteredEntries.map(({ snapshot, preparedQuestion: q }, idx) => {
              const userSelected = snapshot.selectedOption;
              const isCorrect = snapshot.isCorrect;
              const isSlowQuestion =
                record.summary.averageElapsedMs > 0 &&
                snapshot.elapsedMs > record.summary.averageElapsedMs * 1.5 &&
                snapshot.elapsedMs >= 5000;

              return (
                <article
                  key={snapshot.questionId}
                  id={`history-q-${snapshot.questionId}`}
                  className={`${
                    idx >= 4 ? styles.deferredQuestionCard : ""
                  } rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900`}
                >
                  {/* 題頭狀態列 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          答對
                        </span>
                      ) : userSelected === null ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <HelpCircle className="h-3.5 w-3.5" />
                          未作答
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          <XCircle className="h-3.5 w-3.5" />
                          答錯
                        </span>
                      )}

                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        第 {snapshot.displayIndex} 題
                      </span>
                      {record.questionOrder === "random" && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          (原卷第 {snapshot.questionNumber} 題)
                        </span>
                      )}

                      {q && (
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_BADGE_STYLE[q.difficulty]}`}
                        >
                          {q.difficulty}
                        </span>
                      )}

                      {snapshot.isFlagged && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <Flag className="h-3 w-3 fill-amber-500" />
                          已標記
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono font-medium ${
                          isSlowQuestion
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        耗時：{formatDuration(snapshot.elapsedMs)}
                        {isSlowQuestion && " (耗時較長)"}
                      </span>

                      {q && (
                        <>
                          <span className="text-slate-500 dark:text-slate-400">
                            全站答對率：{Math.round(q.correctRate * 100)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => openAiPrompt(q, snapshot)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/60"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI 解析
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 題目內容或無本地考卷降級摘要 */}
                  {!q ? (
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                      <span>
                        正確答案：
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          ({snapshot.answer})
                        </strong>
                      </span>
                      <span>
                        您的選擇：
                        <strong
                          className={
                            isCorrect
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }
                        >
                          {userSelected ? `(${userSelected})` : "未作答"}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 space-y-3">
                        <p className="text-base leading-relaxed font-medium whitespace-pre-line text-slate-900 dark:text-slate-100">
                          {q.question}
                        </p>
                        {q.images.length > 0 && (
                          <div className="flex flex-wrap gap-4">
                            {q.images.map((imgSrc, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={imgSrc}
                                alt={`第 ${q.displayIndex} 題附圖`}
                                loading={idx < 4 ? undefined : "lazy"}
                                className="max-h-80 rounded-xl border border-slate-200 bg-slate-50 object-contain p-2 dark:border-slate-700 dark:bg-slate-800"
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 space-y-2">
                        {OPTION_KEYS.map((optKey) => {
                          const optText = q.options[optKey];
                          const optImgs = q.optionImages?.[optKey] ?? [];
                          if (optText === undefined && optImgs.length === 0) {
                            return null;
                          }

                          const isImageOnly = optImgs.length > 0 && !optText;
                          const isAns = q.answer === optKey;
                          const isUserPick = userSelected === optKey;
                          const pct = q.stats[optKey] ?? 0;

                          let rowClass =
                            "border-slate-200 bg-slate-50/40 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300";
                          if (isAns) {
                            rowClass =
                              "border-emerald-300 bg-emerald-50/80 text-emerald-950 font-semibold dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
                          } else if (isUserPick && !isAns) {
                            rowClass =
                              "border-rose-300 bg-rose-50/80 text-rose-950 font-semibold dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200";
                          }

                          return (
                            <div
                              key={optKey}
                              className={`flex flex-col justify-between gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center ${rowClass}`}
                            >
                              <div
                                className={`flex gap-3 ${
                                  isImageOnly ? "items-center" : "items-start"
                                }`}
                              >
                                <span
                                  className={`${
                                    isImageOnly ? "" : "mt-0.5"
                                  }inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isAns
                                      ? "bg-emerald-600 text-white"
                                      : isUserPick
                                        ? "bg-rose-600 text-white"
                                        : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                  }`}
                                >
                                  {optKey}
                                </span>
                                <div className="space-y-1.5">
                                  {optImgs.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      {optImgs.map((imgSrc, imgIdx) => (
                                        <img
                                          key={imgIdx}
                                          src={imgSrc}
                                          alt={`第 ${q.displayIndex} 題選項 (${optKey}) 附圖 ${imgIdx + 1}`}
                                          loading={idx < 4 ? undefined : "lazy"}
                                          className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-white object-contain p-1.5 dark:border-slate-700"
                                        />
                                      ))}
                                    </div>
                                  )}
                                  {optText && (
                                    <span className="block leading-relaxed">
                                      {optText}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                                {isAns && (
                                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                    正確答案
                                  </span>
                                )}
                                {isUserPick && !isAns && (
                                  <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                    您的選擇
                                  </span>
                                )}
                                {isUserPick && isAns && (
                                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                    您的選擇
                                  </span>
                                )}
                                <span className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  <BarChart3 className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>

      <ConfirmModal
        open={showDeleteConfirm}
        title="確定要刪除此筆測驗紀錄嗎？"
        description={`即將永久刪除「${record.examTitle}」於 ${completedAtFormatted} 的測驗紀錄（得分 ${record.summary.score} 分）。此操作無法復原。`}
        confirmLabel="確定刪除"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <AiPromptModal
        context={aiPromptContext}
        onClose={() => setAiPromptContext(null)}
      />
    </div>
  );
}
