import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Eye,
  EyeOff,
  FileJson,
  Play,
  Search,
} from "lucide-react";
import type { Route } from "./+types/exam-detail";
import { getLocalExam } from "~/services/yamolCrawler.server";
import styles from "~/styles/exam-viewer.module.css";
import {
  ALL_DIFFICULTY_LEVELS,
  type DifficultyLevel,
  type OptionKey,
} from "~/types/exam";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.exam?.title ?? "考卷閱覽";
  return [
    { title: `${title} | 阿摩離線題庫閱覽` },
    { name: "description", content: `閱覽考卷 ${title} 的完整考題與標準答案` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const exam = await getLocalExam(params.examId);
  if (!exam) {
    throw new Response(
      `找不到本地考卷 #${params.examId}，請先返回首頁將該考卷匯入下載至本地。`,
      { status: 404 }
    );
  }
  return { exam };
}

const DIFFICULTY_BADGE_STYLE: Record<DifficultyLevel, string> = {
  非常簡單: "bg-emerald-100 text-emerald-800 border-emerald-200",
  簡單: "bg-teal-100 text-teal-800 border-teal-200",
  適中: "bg-sky-100 text-sky-800 border-sky-200",
  困難: "bg-amber-100 text-amber-800 border-amber-200",
  非常困難: "bg-rose-100 text-rose-800 border-rose-200",
};

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];

export default function ExamDetail({ loaderData }: Route.ComponentProps) {
  const { exam } = loaderData;

  // 預設採用「模糊遮罩（滑鼠移過顯示答案）」模式，重現阿摩看題體驗；可一鍵切換為「直接顯示答案」
  const [answerDisplayMode, setAnswerDisplayMode] = useState<"blur" | "direct">(
    "blur"
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<
    DifficultyLevel | "ALL"
  >("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");
  // 允許點擊個別模糊答案框固定展開
  const [pinnedQuestionIds, setPinnedQuestionIds] = useState<Set<number>>(
    new Set()
  );

  const difficultyCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: exam.questions.length };
    for (const lvl of ALL_DIFFICULTY_LEVELS) {
      counts[lvl] = 0;
    }
    for (const q of exam.questions) {
      counts[q.difficulty] = (counts[q.difficulty] ?? 0) + 1;
    }
    return counts;
  }, [exam.questions]);

  const filteredQuestions = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return exam.questions.filter((q) => {
      const matchDiff =
        selectedDifficulty === "ALL" || q.difficulty === selectedDifficulty;
      if (!matchDiff) return false;
      if (!kw) return true;

      const inStem = q.question.toLowerCase().includes(kw);
      const inOptions = Object.values(q.options).some((opt) =>
        opt?.toLowerCase().includes(kw)
      );
      const matchNumber = String(q.questionNumber) === kw;
      return inStem || inOptions || matchNumber;
    });
  }, [exam.questions, selectedDifficulty, searchKeyword]);

  const togglePinQuestion = (questionId: number) => {
    if (answerDisplayMode === "direct") return;
    setPinnedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* 頂部考卷資訊列 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-indigo-600"
            >
              <ArrowLeft className="h-4 w-4" />
              返回題庫管理中心
            </Link>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={`/api/exams/${exam.examId}/export`}
                download={`exam_${exam.examId}.json`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <FileJson className="h-4 w-4 text-slate-500" />
                匯出考卷 JSON
              </a>

              <Link
                to={`/exams/${exam.examId}/quiz`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" />
                以此考卷開始刷題
              </Link>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                {exam.categoryTitle}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                #{exam.examId}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                共 {exam.totalQuestions} 題
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">{exam.title}</h1>
          </div>
        </div>
      </header>

      {/* 吸頂工具列：答案顯示切換、難度篩選、搜尋 */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-2xs backdrop-blur-xs">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3.5 md:flex-row md:items-center md:justify-between">
          {/* 答案顯示模式切換開關 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              答案顯示方式：
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAnswerDisplayMode("blur")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  answerDisplayMode === "blur"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <EyeOff className="h-3.5 w-3.5" />
                模糊遮罩（滑鼠移過顯示）
              </button>
              <button
                type="button"
                onClick={() => setAnswerDisplayMode("direct")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  answerDisplayMode === "direct"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                直接顯示答案
              </button>
            </div>
          </div>

          {/* 關鍵字搜尋 */}
          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜尋題幹、選項或題號..."
              className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 難度快速過濾列 */}
        <div className="mx-auto flex max-w-5xl items-center gap-1.5 overflow-x-auto border-t border-slate-100 px-6 py-2">
          <span className="shrink-0 text-xs font-medium text-slate-500">
            難度篩選：
          </span>
          <button
            type="button"
            onClick={() => setSelectedDifficulty("ALL")}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              selectedDifficulty === "ALL"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            全部 ({difficultyCounts.ALL})
          </button>
          {ALL_DIFFICULTY_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setSelectedDifficulty(lvl)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                selectedDifficulty === lvl
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {lvl} ({difficultyCounts[lvl] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* 考題列表 */}
      <main className="mx-auto max-w-5xl space-y-5 px-6 pt-6">
        {filteredQuestions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            沒有符合目前篩選條件的題目。
          </div>
        ) : (
          filteredQuestions.map((q, idx) => {
            const isRevealed =
              answerDisplayMode === "direct" || pinnedQuestionIds.has(q.id);
            // 針對首屏以下 (idx >= 4) 的題目卡片套用 content-visibility: auto 提升長試卷渲染效能
            const deferredClass =
              idx >= 4 ? styles.deferredQuestionCard : undefined;

            return (
              <article
                key={q.id}
                className={`${deferredClass ?? ""} rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs transition hover:border-slate-300`}
              >
                {/* 題頭：題號、難度、全站答對率 */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 items-center justify-center rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white">
                      第 {q.questionNumber} 題
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_BADGE_STYLE[q.difficulty]}`}
                    >
                      {q.difficulty}
                    </span>
                  </div>

                  <span className="text-xs font-medium text-slate-500">
                    全站答對率：{Math.round(q.correctRate * 100)}%
                  </span>
                </div>

                {/* 題幹與附圖 */}
                <div className="mt-4 space-y-3">
                  <p className="text-base leading-relaxed font-medium whitespace-pre-line text-slate-900">
                    {q.question}
                  </p>

                  {q.images.length > 0 && (
                    <div className="flex flex-wrap gap-4 pt-1">
                      {q.images.map((imgSrc, imgIdx) => (
                        <img
                          key={imgIdx}
                          src={imgSrc}
                          alt={`第 ${q.questionNumber} 題附圖 ${imgIdx + 1}`}
                          loading={idx < 2 ? "eager" : "lazy"}
                          className="max-h-80 rounded-xl border border-slate-200 bg-slate-50 object-contain p-2"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 選項列表 */}
                <div className="mt-4 space-y-2">
                  {OPTION_KEYS.map((optKey) => {
                    const optText = q.options[optKey];
                    if (optText === undefined) return null;

                    const isCorrectOption = q.answer === optKey;
                    const highlightCorrect =
                      answerDisplayMode === "direct" && isCorrectOption;

                    return (
                      <div
                        key={optKey}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                          highlightCorrect
                            ? "border-emerald-300 bg-emerald-50/70 font-semibold text-emerald-950"
                            : "border-slate-200/80 bg-slate-50/50 text-slate-800"
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            highlightCorrect
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {optKey}
                        </span>
                        <span className="flex-1 leading-relaxed">{optText}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 答案與全站選答率區塊（支援模糊遮罩 hover 顯示 或 直接顯示） */}
                <div
                  tabIndex={answerDisplayMode === "blur" ? 0 : undefined}
                  onClick={() => togglePinQuestion(q.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePinQuestion(q.id);
                    }
                  }}
                  className={`mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 ${
                    answerDisplayMode === "blur"
                      ? `${styles.blurAnswerContainer} ${
                          isRevealed ? styles.blurAnswerRevealed : ""
                        }`
                      : ""
                  }`}
                >
                  {answerDisplayMode === "blur" && !isRevealed && (
                    <span
                      className={`${styles.blurHintBadge} pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-indigo-600/90 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-2xs`}
                    >
                      滑鼠移過顯示答案（點擊可固定）
                    </span>
                  )}

                  <div
                    className={`flex flex-col justify-between gap-3 sm:flex-row sm:items-center ${
                      answerDisplayMode === "blur"
                        ? styles.blurAnswerContent
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-slate-600">
                        正確答案：
                      </span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-2xs">
                        {q.answer}
                      </span>
                    </div>

                    {/* 全站選答率統計 */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1 font-medium text-slate-500">
                        <BarChart3 className="h-3.5 w-3.5" />
                        全站選答率：
                      </span>
                      {OPTION_KEYS.map((k) => {
                        if (q.options[k] === undefined) return null;
                        const pct = q.stats[k] ?? 0;
                        const isAns = q.answer === k;
                        return (
                          <span
                            key={k}
                            className={`rounded-md px-2 py-0.5 font-mono text-xs ${
                              isAns
                                ? "bg-emerald-100 font-bold text-emerald-800"
                                : "bg-white text-slate-600"
                            }`}
                          >
                            ({k}) {pct}%
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
