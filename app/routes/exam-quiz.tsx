import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useFetcher,
  useOutletContext,
  useSearchParams,
} from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flag,
  HelpCircle,
  History,
  LayoutGrid,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import type { Route } from "./+types/exam-quiz";
import type { AppShellOutletContext } from "./app-shell";
import { AiPromptModal } from "~/components/AiPromptModal";
import { ConfirmModal } from "~/components/ConfirmModal";
import { ThemeToggle } from "~/components/ThemeToggle";
import type { AiPromptQuestionContext } from "~/services/aiPromptBuilder";
import {
  aggregateExamHistoryStats,
  buildQuizHistoryItems,
  calculateQuizSummary,
  formatCountdown,
  formatDuration,
  prepareQuizQuestions,
  prepareSingleQuestion,
} from "~/services/quizEngine";
import {
  getQuizHistoryRecord,
  listQuizHistorySummaries,
  saveQuizHistoryRecord,
  type CreateQuizHistoryInput,
} from "~/services/quizHistory.server";
import { getLocalExam } from "~/services/yamolCrawler.server";
import {
  ALL_DIFFICULTY_LEVELS,
  type DifficultyLevel,
  type ExamQuestion,
  type OptionKey,
  type OrderStrategy,
  type PreparedQuestion,
  type QuestionAttempt,
  type QuizConfig,
  type QuizMode,
} from "~/types/exam";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.exam?.title ?? "刷題測驗";
  return [
    { title: `刷題與模擬測驗 — ${title}` },
    {
      name: "description",
      content: `進行 ${title} 的單題練習或計時模擬測驗`,
    },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const retryRecordId = url.searchParams.get("retryRecord");

  const [exam, examHistoryList, retryRecord] = await Promise.all([
    getLocalExam(params.examId),
    listQuizHistorySummaries(params.examId),
    retryRecordId ? getQuizHistoryRecord(retryRecordId) : Promise.resolve(null),
  ]);

  if (!exam) {
    throw new Response(
      `找不到本地考卷 #${params.examId}，請先前往「匯入與探索考卷」下載此考卷。`,
      { status: 404 }
    );
  }

  const statsMap = aggregateExamHistoryStats(examHistoryList);
  const validRetryIds =
    retryRecord &&
    retryRecord.examId === exam.examId &&
    retryRecord.wrongQuestionIds.length > 0
      ? retryRecord.wrongQuestionIds
      : null;

  return {
    exam,
    examHistoryStats: statsMap[exam.examId] ?? null,
    latestHistorySummary: examHistoryList[0] ?? null,
    initialRetryQuestionIds: validRetryIds,
  };
}

type SaveHistoryActionResponse =
  { ok: true; recordId: string } | { ok: false; error: string };

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<SaveHistoryActionResponse> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "save_history") {
    return { ok: false, error: "未知的操作指令" };
  }

  try {
    const rawPayload = String(formData.get("payload") || "");
    const parsed = JSON.parse(rawPayload) as CreateQuizHistoryInput;
    if (!parsed || parsed.examId !== params.examId) {
      return { ok: false, error: "考卷編號不一致" };
    }
    const saved = await saveQuizHistoryRecord(parsed);
    return { ok: true, recordId: saved.recordId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "儲存測驗紀錄失敗",
    };
  }
}

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

type QuizPhase = "setup" | "active" | "summary";
type ReviewFilter = "all" | "wrong_or_unanswered" | "flagged";
type ReviewSort = "index" | "time_desc";

export default function ExamQuiz({ loaderData }: Route.ComponentProps) {
  const {
    exam,
    examHistoryStats,
    latestHistorySummary,
    initialRetryQuestionIds,
  } = loaderData;

  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const setQuizFocusMode = outletContext?.setQuizFocusMode;
  const [searchParams, setSearchParams] = useSearchParams();
  const saveHistoryFetcher = useFetcher<SaveHistoryActionResponse>();

  // ==================== 1. 設定階段狀態 ====================
  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [retryTargetIds, setRetryTargetIds] = useState<number[] | null>(
    initialRetryQuestionIds
  );
  const [mode, setMode] = useState<QuizMode>("practice");
  const [questionOrder, setQuestionOrder] =
    useState<OrderStrategy>("sequential");
  const [optionOrder, setOptionOrder] = useState<OrderStrategy>(() =>
    initialRetryQuestionIds ? "random" : "sequential"
  );
  const [selectedDifficulties, setSelectedDifficulties] = useState<
    DifficultyLevel[]
  >([...ALL_DIFFICULTY_LEVELS]);
  const [showDifficultyInPractice, setShowDifficultyInPractice] =
    useState<boolean>(true);
  const [enableTimeLimit, setEnableTimeLimit] = useState<boolean>(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(60);

  // ==================== 2. 測驗進行中狀態 ====================
  const [activeQuestions, setActiveQuestions] = useState<PreparedQuestion[]>(
    []
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [attempts, setAttempts] = useState<Record<number, QuestionAttempt>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isAutoSubmittedByTimeout, setIsAutoSubmittedByTimeout] =
    useState<boolean>(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] =
    useState<boolean>(false);

  // 追蹤當前題目進入時間戳記與進題前的已累計毫秒數，避免點選選項更新 attempts 時重置計時器
  const questionStartRef = useRef<number | null>(null);
  const baseElapsedRef = useRef<number>(0);
  const [currentLiveElapsedMs, setCurrentLiveElapsedMs] = useState<number>(0);
  const isCurrentSessionRetryRef = useRef<boolean>(false);
  const hasSavedCurrentSessionRef = useRef<boolean>(false);

  // 同步通知外層 AppShell 是否處於專注作答階段（作答中自動隱藏側邊導覽列）
  useEffect(() => {
    setQuizFocusMode?.(phase === "active");
    return () => {
      setQuizFocusMode?.(false);
    };
  }, [phase, setQuizFocusMode]);

  // ==================== 3. 結算檢討階段狀態 ====================
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [reviewSort, setReviewSort] = useState<ReviewSort>("index");
  const [aiPromptContext, setAiPromptContext] =
    useState<AiPromptQuestionContext | null>(null);

  const openAiPromptForPreparedQuestion = useCallback(
    (q: PreparedQuestion) => {
      const att = attempts[q.id];
      setAiPromptContext({
        examTitle: exam.title,
        categoryTitle: exam.categoryTitle,
        examYear: exam.year,
        questionNumber: q.displayIndex,
        originalQuestionNumber:
          questionOrder === "random" ? q.questionNumber : undefined,
        question: q.question,
        options: q.options,
        optionImages: q.optionImages,
        answer: q.answer,
        difficulty: q.difficulty,
        correctRate: q.correctRate,
        stats: q.stats,
        images: q.images,
        userSelectedOption: att ? att.selectedOption : undefined,
      });
    },
    [attempts, exam.categoryTitle, exam.title, exam.year, questionOrder]
  );

  // 若處於「指定錯題重練」狀態，題目來源鎖定為該批錯題
  const setupSourceQuestions = useMemo(() => {
    if (!retryTargetIds || retryTargetIds.length === 0) {
      return exam.questions;
    }
    const idSet = new Set(retryTargetIds);
    const matched = exam.questions.filter((q) => idSet.has(q.id));
    return matched.length > 0 ? matched : exam.questions;
  }, [exam.questions, retryTargetIds]);

  // 統計設定階段來源題庫的各難度題數
  const difficultyCounts = useMemo(() => {
    const counts: Record<DifficultyLevel, number> = {
      非常簡單: 0,
      簡單: 0,
      適中: 0,
      困難: 0,
      非常困難: 0,
    };
    for (const q of setupSourceQuestions) {
      counts[q.difficulty] = (counts[q.difficulty] ?? 0) + 1;
    }
    return counts;
  }, [setupSourceQuestions]);

  // 計算設定階段符合所選難度的題目數量
  const matchingQuestionCount = useMemo(() => {
    if (mode === "mock") return setupSourceQuestions.length;
    if (selectedDifficulties.length === 0) return 0;
    return setupSourceQuestions.filter((q) =>
      selectedDifficulties.includes(q.difficulty)
    ).length;
  }, [setupSourceQuestions, mode, selectedDifficulties]);

  const currentQuestion = activeQuestions[currentIndex];
  const currentAttempt = currentQuestion
    ? attempts[currentQuestion.id]
    : undefined;

  // 判斷目前題目是否仍在「思考計時中」
  // 模擬考模式：只要在 active 階段都算思考時間
  // 單題練習模式：尚未按下「送出答案」前算思考時間；送出後看解析不計入思考耗時
  const isCurrentQuestionTiming =
    phase === "active" &&
    Boolean(currentQuestion) &&
    (mode === "mock" || !currentAttempt?.isSubmitted);

  // 將當前題目尚未寫入的停留毫秒數結算進 attempts 與 baseElapsedRef
  const flushCurrentQuestionTime = useCallback(() => {
    const now = performance.now();
    const start = questionStartRef.current;
    if (start === null || !currentQuestion) return;

    const deltaMs = Math.max(0, Math.round(now - start));
    const updatedElapsed = baseElapsedRef.current + deltaMs;
    baseElapsedRef.current = updatedElapsed;
    questionStartRef.current = now;

    setAttempts((prev) => {
      const existing = prev[currentQuestion.id];
      if (!existing) return prev;
      return {
        ...prev,
        [currentQuestion.id]: {
          ...existing,
          elapsedMs: updatedElapsed,
        },
      };
    });
  }, [currentQuestion]);

  // 當切換題目或計時狀態改變時，啟動或暫停該題計時器（不依賴 attempts，故點選選項或標記時不會重設）
  const currentQuestionId = currentQuestion?.id ?? null;
  useEffect(() => {
    if (!isCurrentQuestionTiming || currentQuestionId === null) {
      questionStartRef.current = null;
      return;
    }

    questionStartRef.current = performance.now();

    const intervalId = window.setInterval(() => {
      if (questionStartRef.current !== null) {
        const delta = Math.max(
          0,
          Math.round(performance.now() - questionStartRef.current)
        );
        setCurrentLiveElapsedMs(baseElapsedRef.current + delta);
      }
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentQuestionId, isCurrentQuestionTiming]);

  // 結束測驗、自動寫入本地歷史測驗紀錄並進入結算畫面
  const finalizeQuiz = useCallback(
    (autoByTimeout = false) => {
      const flushedAttempts: Record<number, QuestionAttempt> = { ...attempts };
      const start = questionStartRef.current;

      if (start !== null && currentQuestion) {
        const deltaMs = Math.max(0, Math.round(performance.now() - start));
        const updatedElapsed = baseElapsedRef.current + deltaMs;
        baseElapsedRef.current = updatedElapsed;
        const existing = flushedAttempts[currentQuestion.id];
        if (existing) {
          flushedAttempts[currentQuestion.id] = {
            ...existing,
            elapsedMs: updatedElapsed,
          };
        }
      }

      questionStartRef.current = null;
      setAttempts(flushedAttempts);
      setIsAutoSubmittedByTimeout(autoByTimeout);
      setShowSubmitConfirmModal(false);
      setReviewFilter("all");
      setReviewSort("index");
      setPhase("summary");
      window.scrollTo({ top: 0, behavior: "smooth" });

      const summarySnapshot = calculateQuizSummary(
        activeQuestions,
        flushedAttempts
      );

      if (
        !hasSavedCurrentSessionRef.current &&
        activeQuestions.length > 0 &&
        (mode === "mock" || summarySnapshot.answeredCount > 0)
      ) {
        hasSavedCurrentSessionRef.current = true;

        const items = buildQuizHistoryItems(activeQuestions, flushedAttempts);
        const wrongQuestionIds = items
          .filter((item) => !item.isCorrect)
          .map((item) => item.questionId);

        const payload: CreateQuizHistoryInput = {
          examId: exam.examId,
          examTitle: exam.title,
          categoryTitle: exam.categoryTitle,
          examYear: exam.year,
          mode,
          isRetryWrongOnly: isCurrentSessionRetryRef.current || undefined,
          isAutoSubmittedByTimeout: autoByTimeout,
          questionOrder,
          optionOrder,
          timeLimitMinutes:
            mode === "mock" && enableTimeLimit ? timeLimitMinutes : null,
          summary: summarySnapshot,
          wrongQuestionIds,
          items,
        };

        const formData = new FormData();
        formData.append("intent", "save_history");
        formData.append("payload", JSON.stringify(payload));
        saveHistoryFetcher.submit(formData, { method: "post" });
      }
    },
    [
      attempts,
      currentQuestion,
      activeQuestions,
      mode,
      exam.examId,
      exam.title,
      exam.categoryTitle,
      exam.year,
      questionOrder,
      optionOrder,
      enableTimeLimit,
      timeLimitMinutes,
      saveHistoryFetcher,
    ]
  );

  // 模擬考模式：全域倒數計時器
  useEffect(() => {
    if (
      phase !== "active" ||
      mode !== "mock" ||
      remainingSeconds === null ||
      remainingSeconds <= 0
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(timerId);
          finalizeQuiz(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [phase, mode, remainingSeconds, finalizeQuiz]);

  // 啟動測驗（支援傳入自訂題目清單，例如「針對本次錯題重新練習」）
  const startQuizWithQuestions = (
    sourceQuestions: readonly ExamQuestion[],
    overrideConfig?: Partial<QuizConfig>,
    isRetryWrongOnly = false
  ) => {
    const effectiveMode = overrideConfig?.mode ?? mode;
    const effectiveQuestionOrder =
      overrideConfig?.questionOrder ?? questionOrder;
    const effectiveOptionOrder = overrideConfig?.optionOrder ?? optionOrder;
    const effectiveDifficulties =
      overrideConfig?.selectedDifficulties ??
      (effectiveMode === "practice"
        ? selectedDifficulties
        : [...ALL_DIFFICULTY_LEVELS]);

    const prepared = overrideConfig?.selectedDifficulties
      ? prepareQuizQuestions(sourceQuestions, {
          questionOrder: effectiveQuestionOrder,
          optionOrder: effectiveOptionOrder,
          selectedDifficulties: effectiveDifficulties,
        })
      : effectiveMode === "mock"
        ? effectiveQuestionOrder === "random"
          ? prepareQuizQuestions(sourceQuestions, {
              questionOrder: "random",
              optionOrder: effectiveOptionOrder,
              selectedDifficulties: [],
            })
          : sourceQuestions.map((q, idx) =>
              prepareSingleQuestion(q, idx + 1, effectiveOptionOrder)
            )
        : prepareQuizQuestions(sourceQuestions, {
            questionOrder: effectiveQuestionOrder,
            optionOrder: effectiveOptionOrder,
            selectedDifficulties: effectiveDifficulties,
          });

    if (prepared.length === 0) return;

    const initialAttempts: Record<number, QuestionAttempt> = {};
    for (const q of prepared) {
      initialAttempts[q.id] = {
        questionId: q.id,
        questionNumber: q.questionNumber,
        selectedOption: null,
        isSubmitted: false,
        isCorrect: false,
        isFlagged: false,
        elapsedMs: 0,
      };
    }

    baseElapsedRef.current = 0;
    isCurrentSessionRetryRef.current = isRetryWrongOnly;
    hasSavedCurrentSessionRef.current = false;
    setActiveQuestions(prepared);
    setAttempts(initialAttempts);
    setCurrentIndex(0);
    setCurrentLiveElapsedMs(0);
    setIsAutoSubmittedByTimeout(false);

    if (effectiveMode === "mock" && enableTimeLimit && timeLimitMinutes > 0) {
      setRemainingSeconds(timeLimitMinutes * 60);
    } else {
      setRemainingSeconds(null);
    }

    setPhase("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 切換題目（自動結算前一題耗時，並載入目標題目先前已累計的耗時）
  const goToQuestion = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= activeQuestions.length) return;
      if (targetIndex === currentIndex) return;
      flushCurrentQuestionTime();
      const targetQ = activeQuestions[targetIndex];
      const targetElapsed = targetQ
        ? (attempts[targetQ.id]?.elapsedMs ?? 0)
        : 0;
      baseElapsedRef.current = targetElapsed;
      setCurrentLiveElapsedMs(targetElapsed);
      setCurrentIndex(targetIndex);
    },
    [activeQuestions, currentIndex, flushCurrentQuestionTime, attempts]
  );

  // 選擇選項
  const handleSelectOption = useCallback(
    (optKey: OptionKey) => {
      if (!currentQuestion) return;
      const existing = attempts[currentQuestion.id];
      // 單題練習模式下若已送出批改，不再更改選項
      if (mode === "practice" && existing?.isSubmitted) return;

      setAttempts((prev) => {
        const curr = prev[currentQuestion.id];
        if (!curr) return prev;
        return {
          ...prev,
          [currentQuestion.id]: {
            ...curr,
            selectedOption: optKey,
            isCorrect: optKey === currentQuestion.answer,
          },
        };
      });
    },
    [currentQuestion, attempts, mode]
  );

  // 單題練習模式：送出當前題目答案並立即顯示對錯
  const handleSubmitPracticeAnswer = useCallback(() => {
    if (!currentQuestion || mode !== "practice") return;
    const existing = attempts[currentQuestion.id];
    if (!existing || existing.selectedOption === null || existing.isSubmitted) {
      return;
    }

    // 結算至按下送出瞬間的思考耗時
    const now = performance.now();
    const deltaMs =
      questionStartRef.current !== null
        ? Math.max(0, Math.round(now - questionStartRef.current))
        : 0;
    questionStartRef.current = null;

    const updatedElapsed = baseElapsedRef.current + deltaMs;
    baseElapsedRef.current = updatedElapsed;
    setCurrentLiveElapsedMs(updatedElapsed);

    setAttempts((prev) => {
      const curr = prev[currentQuestion.id];
      if (!curr) return prev;
      return {
        ...prev,
        [currentQuestion.id]: {
          ...curr,
          isSubmitted: true,
          isCorrect: curr.selectedOption === currentQuestion.answer,
          elapsedMs: updatedElapsed,
        },
      };
    });
  }, [currentQuestion, mode, attempts]);

  // 切換不確定標記 (Flag)
  const handleToggleFlag = useCallback(() => {
    if (!currentQuestion) return;
    setAttempts((prev) => {
      const curr = prev[currentQuestion.id];
      if (!curr) return prev;
      return {
        ...prev,
        [currentQuestion.id]: {
          ...curr,
          isFlagged: !curr.isFlagged,
        },
      };
    });
  }, [currentQuestion]);

  // 鍵盤快捷鍵支援 (A~E / 1~5 選擇選項，左右方向鍵換題，F 標記，Enter 送出或下一題)
  useEffect(() => {
    if (
      phase !== "active" ||
      showSubmitConfirmModal ||
      aiPromptContext !== null
    ) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const keyUpper = e.key.toUpperCase();
      const keyMap: Record<string, OptionKey> = {
        A: "A",
        B: "B",
        C: "C",
        D: "D",
        E: "E",
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "D",
        "5": "E",
      };

      const mappedOpt = keyMap[keyUpper];
      if (
        mappedOpt &&
        (currentQuestion?.options[mappedOpt] !== undefined ||
          (currentQuestion?.optionImages?.[mappedOpt]?.length ?? 0) > 0)
      ) {
        e.preventDefault();
        handleSelectOption(mappedOpt);
        return;
      }

      if (keyUpper === "F") {
        e.preventDefault();
        handleToggleFlag();
        return;
      }

      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        goToQuestion(currentIndex - 1);
        return;
      }

      if (e.key === "ArrowRight" && currentIndex < activeQuestions.length - 1) {
        e.preventDefault();
        goToQuestion(currentIndex + 1);
        return;
      }

      if (e.key === "Enter" && mode === "practice") {
        e.preventDefault();
        if (!currentAttempt?.isSubmitted && currentAttempt?.selectedOption) {
          handleSubmitPracticeAnswer();
        } else if (
          currentAttempt?.isSubmitted &&
          currentIndex < activeQuestions.length - 1
        ) {
          goToQuestion(currentIndex + 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    phase,
    showSubmitConfirmModal,
    aiPromptContext,
    currentQuestion,
    currentIndex,
    activeQuestions.length,
    mode,
    currentAttempt,
    handleSelectOption,
    handleToggleFlag,
    goToQuestion,
    handleSubmitPracticeAnswer,
  ]);

  // 答題進度統計
  const progressStats = useMemo(() => {
    let answered = 0;
    let flagged = 0;
    for (const q of activeQuestions) {
      const att = attempts[q.id];
      if (att?.selectedOption !== null && att?.selectedOption !== undefined) {
        answered++;
      }
      if (att?.isFlagged) {
        flagged++;
      }
    }
    const total = activeQuestions.length;
    return {
      total,
      answered,
      unanswered: total - answered,
      flagged,
      percent: total > 0 ? Math.round((answered / total) * 100) : 0,
    };
  }, [activeQuestions, attempts]);

  // 結算成績統計
  const summaryResult = useMemo(
    () => calculateQuizSummary(activeQuestions, attempts),
    [activeQuestions, attempts]
  );

  // 耗時最久的前 3 題
  const slowestQuestions = useMemo(() => {
    if (phase !== "summary") return [];
    return [...activeQuestions]
      .sort(
        (a, b) =>
          (attempts[b.id]?.elapsedMs ?? 0) - (attempts[a.id]?.elapsedMs ?? 0)
      )
      .slice(0, 3)
      .filter((q) => (attempts[q.id]?.elapsedMs ?? 0) > 0);
  }, [phase, activeQuestions, attempts]);

  // 結算頁篩選與排序後的檢討題目列表
  const reviewedQuestions = useMemo(() => {
    const filtered = activeQuestions.filter((q) => {
      const att = attempts[q.id];
      if (reviewFilter === "wrong_or_unanswered") {
        return !att || att.selectedOption !== q.answer;
      }
      if (reviewFilter === "flagged") {
        return Boolean(att?.isFlagged);
      }
      return true;
    });

    if (reviewSort === "time_desc") {
      return [...filtered].sort(
        (a, b) =>
          (attempts[b.id]?.elapsedMs ?? 0) - (attempts[a.id]?.elapsedMs ?? 0)
      );
    }
    return filtered;
  }, [activeQuestions, attempts, reviewFilter, reviewSort]);

  // 針對本次答錯或未答的題目重新開始單題練習
  const handleRetryWrongQuestions = () => {
    const wrongIds = new Set(
      activeQuestions
        .filter((q) => attempts[q.id]?.selectedOption !== q.answer)
        .map((q) => q.id)
    );
    const originalWrongQuestions = exam.questions.filter((q) =>
      wrongIds.has(q.id)
    );
    if (originalWrongQuestions.length === 0) return;

    setMode("practice");
    startQuizWithQuestions(
      originalWrongQuestions,
      {
        mode: "practice",
        questionOrder,
        optionOrder,
        selectedDifficulties: [...ALL_DIFFICULTY_LEVELS],
      },
      true
    );
  };

  // 從設定頁直接針對上次歷史紀錄的錯題啟動單題練習
  const handleQuickRetryLatestWrong = () => {
    if (
      !latestHistorySummary ||
      latestHistorySummary.wrongQuestionIds.length === 0
    ) {
      return;
    }
    const wrongIdSet = new Set(latestHistorySummary.wrongQuestionIds);
    const targetQuestions = exam.questions.filter((q) => wrongIdSet.has(q.id));
    if (targetQuestions.length === 0) return;

    setMode("practice");
    startQuizWithQuestions(
      targetQuestions,
      {
        mode: "practice",
        questionOrder,
        optionOrder,
        selectedDifficulties: [...ALL_DIFFICULTY_LEVELS],
      },
      true
    );
  };

  const handleClearRetryTarget = () => {
    setRetryTargetIds(null);
    if (searchParams.has("retryRecord")) {
      const next = new URLSearchParams(searchParams);
      next.delete("retryRecord");
      setSearchParams(next, { replace: true });
    }
  };

  const toggleDifficultySelection = (lvl: DifficultyLevel) => {
    setSelectedDifficulties((prev) =>
      prev.includes(lvl) ? prev.filter((item) => item !== lvl) : [...prev, lvl]
    );
  };

  // ==================== 畫面渲染：1. 設定階段 ====================
  if (phase === "setup") {
    const isRetryModeActive =
      retryTargetIds !== null && retryTargetIds.length > 0;

    return (
      <div className="pb-16">
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Link
              to={`/exams/${exam.examId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
            >
              <ArrowLeft className="h-4 w-4" />
              返回考卷閱覽
            </Link>

            {examHistoryStats && (
              <Link
                to={`/history?examId=${exam.examId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <History className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                此卷測驗紀錄 ({examHistoryStats.attemptCount} 次)
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-6 px-6 pt-8">
          {/* 若透過歷史紀錄「重練錯題」進入時的專項提示卡片 */}
          {isRetryModeActive && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-bold">
                    已鎖定歷史紀錄中的 {setupSourceQuestions.length}{" "}
                    道錯題／未答題進行專項重練
                  </p>
                  <p className="text-xs opacity-85">
                    已預設開啟「隨機打亂選項」避免背誦位置，您仍可於下方自由調整順序後開始。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearRetryTarget}
                className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
              >
                <X className="h-3.5 w-3.5" />
                改回練習完整考卷 ({exam.totalQuestions} 題)
              </button>
            </div>
          )}

          {/* 考卷標題卡片與歷史表現摘要 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                {exam.categoryTitle}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                #{exam.examId}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                總題數 {exam.totalQuestions} 題
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
              {exam.title}
            </h1>

            {!isRetryModeActive && examHistoryStats && latestHistorySummary && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    歷史最佳：{examHistoryStats.bestScore} 分
                  </span>
                  <span>·</span>
                  <span>
                    上次得分：
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {examHistoryStats.latestScore} 分
                    </strong>{" "}
                    （共測驗 {examHistoryStats.attemptCount} 次）
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/history/${examHistoryStats.latestRecordId}`}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    檢視上次檢討
                  </Link>
                  {latestHistorySummary.wrongQuestionIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleQuickRetryLatestWrong}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white transition hover:bg-amber-700"
                    >
                      <RotateCcw className="h-3 w-3" />
                      直接重練上次錯題 (
                      {latestHistorySummary.wrongQuestionIds.length} 題)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 模式選擇 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              步驟 1：選擇刷題模式
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`flex flex-col items-start rounded-2xl border-2 p-5 text-left transition ${
                  mode === "practice"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    單題練習模式
                  </span>
                  {mode === "practice" && (
                    <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      目前選擇
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  每次顯示一題，選好並送出答案後立即批改對錯、顯示標準答案與全站選答率統計。支援指定特定難度的題目練習。
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("mock")}
                className={`flex flex-col items-start rounded-2xl border-2 p-5 text-left transition ${
                  mode === "mock"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    <Timer className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    模擬考模式
                  </span>
                  {mode === "mock" && (
                    <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      目前選擇
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  仿真實考場體驗，支援倒數計時、不確定題目標記 (Flag)
                  與日曆式答題卡跳轉，交卷後統一計分、分析各題耗時與檢討錯題。
                </p>
              </button>
            </div>
          </section>

          {/* 通用設定：題目順序與選項順序 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <Shuffle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              步驟 2：出題與選項順序設定（通用）
            </h2>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  題目出現順序
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setQuestionOrder("sequential")}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      questionOrder === "sequential"
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    依原題號順序 (1 → {exam.totalQuestions})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionOrder("random")}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      questionOrder === "random"
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    🔀 隨機打亂題目順序
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  選項 (A)(B)(C)(D) 順序
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOptionOrder("sequential")}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      optionOrder === "sequential"
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    依原選項順序
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionOrder("random")}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      optionOrder === "random"
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    🔀 隨機打亂選項（防背位置）
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  *
                  打亂選項時，系統會自動重新對齊選項附圖、正確答案與全站選答率統計。
                </p>
              </div>
            </div>
          </section>

          {/* 模式專屬設定 */}
          {mode === "practice" ? (
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  步驟 3：單題練習模式專屬選項
                </h2>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                  符合篩選題數：{matchingQuestionCount} /{" "}
                  {setupSourceQuestions.length} 題
                </span>
              </div>

              {/* 考題難度指定（多選） */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    指定練習考題難度（可多選）
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDifficulties([...ALL_DIFFICULTY_LEVELS])
                      }
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      全選難度
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">
                      |
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDifficulties(["困難", "非常困難"])
                      }
                      className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                    >
                      只選困難＋非常困難
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {ALL_DIFFICULTY_LEVELS.map((lvl) => {
                    const isSelected = selectedDifficulties.includes(lvl);
                    const count = difficultyCounts[lvl] ?? 0;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => toggleDifficultySelection(lvl)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-800 shadow-2xs dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={isSelected}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 dark:border-slate-600"
                        />
                        <span>{lvl}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {count} 題
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 作答時是否顯示考題難度 */}
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {showDifficultyInPractice ? (
                        <Eye className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      )}
                      作答過程中顯示考題難易度標籤
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      若關閉，作答時將隱藏「簡單／困難」標籤以免影響作答心理，送出答案後才會顯示。
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={showDifficultyInPractice}
                    onChange={(e) =>
                      setShowDifficultyInPractice(e.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                  />
                </label>
              </div>
            </section>
          ) : (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                步驟 3：模擬考模式專屬選項
              </h2>

              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enableTimeLimit}
                    onChange={(e) => setEnableTimeLimit(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      啟用模擬考倒數計時限制
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      倒數時間歸零時系統將自動停止作答並交卷結算成績
                    </p>
                  </div>
                </label>

                {enableTimeLimit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {[30, 50, 60, 75, 90].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTimeLimitMinutes(preset)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          timeLimitMinutes === preset
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                      >
                        {preset} 分鐘
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={timeLimitMinutes}
                        onChange={(e) =>
                          setTimeLimitMinutes(
                            Math.max(1, Number(e.target.value) || 60)
                          )
                        }
                        aria-label="自訂測驗分鐘數"
                        className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-bold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400"
                      />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        分鐘
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 啟動按鈕 */}
          <div className="flex items-center justify-end gap-4">
            {matchingQuestionCount === 0 && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                ⚠️ 目前勾選的難度沒有對應題目，請至少勾選一個含有題目的難度。
              </p>
            )}
            <button
              type="button"
              disabled={matchingQuestionCount === 0}
              onClick={() =>
                startQuizWithQuestions(
                  setupSourceQuestions,
                  undefined,
                  isRetryModeActive
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              開始
              {isRetryModeActive
                ? "錯題專項"
                : mode === "practice"
                  ? "單題練習"
                  : "模擬測驗"}{" "}
              ({matchingQuestionCount} 題)
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==================== 畫面渲染：2. 作答進行中階段 ====================
  if (phase === "active" && currentQuestion) {
    const isAnswered =
      currentAttempt?.selectedOption !== null &&
      currentAttempt?.selectedOption !== undefined;
    const isPracticeSubmitted =
      mode === "practice" && Boolean(currentAttempt?.isSubmitted);
    const shouldShowDifficulty =
      mode === "mock" || showDifficultyInPractice || isPracticeSubmitted;
    const isLowTimeWarning =
      remainingSeconds !== null && remainingSeconds <= 300;

    return (
      <div className="min-h-screen bg-slate-50 pb-20 dark:bg-slate-950">
        {/* 吸頂作答狀態列 */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  flushCurrentQuestionTime();
                  setPhase("setup");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                重設選項
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    {mode === "practice" ? "單題練習模式" : "模擬考模式"}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    進度：{currentIndex + 1} / {activeQuestions.length} 題
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {exam.title}
                </p>
              </div>
            </div>

            {/* 倒數計時器與交卷按鈕 */}
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle />

              {mode === "mock" && remainingSeconds !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 font-mono text-sm font-bold ${
                    isLowTimeWarning
                      ? "animate-pulse border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      : "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  <Timer className="h-4 w-4" />
                  剩餘時間：{formatCountdown(remainingSeconds)}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (mode === "mock") {
                    setShowSubmitConfirmModal(true);
                  } else {
                    finalizeQuiz(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700"
              >
                <Send className="h-3.5 w-3.5" />
                {mode === "mock" ? "交卷結算成績" : "結束練習並看統計"}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-6xl gap-6 px-6 pt-6 lg:grid-cols-12">
          {/* 左側主作答卡片 (佔 8 欄) */}
          <div className="space-y-5 lg:col-span-8">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              {/* 題號、難度、單題即時耗時與標記按鈕 */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white dark:bg-slate-800 dark:text-slate-100">
                    第 {currentIndex + 1} 題
                  </span>
                  {questionOrder === "random" && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      (原卷第 {currentQuestion.questionNumber} 題)
                    </span>
                  )}
                  {shouldShowDifficulty && (
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_BADGE_STYLE[currentQuestion.difficulty]}`}
                    >
                      {currentQuestion.difficulty}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    title="在此題累計花費的思考時間"
                  >
                    <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    本題耗時：{formatDuration(currentLiveElapsedMs)}
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleFlag}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold transition ${
                      currentAttempt?.isFlagged
                        ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Flag
                      className={`h-3.5 w-3.5 ${
                        currentAttempt?.isFlagged
                          ? "fill-amber-500 text-amber-600 dark:text-amber-400"
                          : ""
                      }`}
                    />
                    {currentAttempt?.isFlagged ? "已標記不確定" : "標記不確定"}
                  </button>
                </div>
              </div>

              {/* 題幹與附圖 */}
              <div className="mt-5 space-y-4">
                <p className="text-base leading-relaxed font-medium whitespace-pre-line text-slate-900 dark:text-slate-100">
                  {currentQuestion.question}
                </p>

                {currentQuestion.images.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {currentQuestion.images.map((imgSrc, imgIdx) => (
                      <img
                        key={imgIdx}
                        src={imgSrc}
                        alt={`題目附圖 ${imgIdx + 1}`}
                        className="max-h-80 rounded-xl border border-slate-200 bg-slate-50 object-contain p-2 dark:border-slate-700 dark:bg-slate-800"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 選項列表 */}
              <div className="mt-6 space-y-2.5">
                {OPTION_KEYS.map((optKey) => {
                  const optText = currentQuestion.options[optKey];
                  const optImgs = currentQuestion.optionImages?.[optKey] ?? [];
                  if (optText === undefined && optImgs.length === 0) {
                    return null;
                  }

                  const isImageOnlyWithoutMeta =
                    optImgs.length > 0 && !optText && !isPracticeSubmitted;
                  const isSelected = currentAttempt?.selectedOption === optKey;
                  const isCorrectOpt = currentQuestion.answer === optKey;

                  let cardStyle =
                    "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/30";
                  let badgeStyle =
                    "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

                  if (isPracticeSubmitted) {
                    if (isCorrectOpt) {
                      cardStyle =
                        "border-emerald-400 bg-emerald-50/80 text-emerald-950 font-semibold dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200";
                      badgeStyle = "bg-emerald-600 text-white";
                    } else if (isSelected && !isCorrectOpt) {
                      cardStyle =
                        "border-rose-400 bg-rose-50/80 text-rose-950 font-semibold dark:border-rose-600 dark:bg-rose-950/40 dark:text-rose-200";
                      badgeStyle = "bg-rose-600 text-white";
                    } else {
                      cardStyle =
                        "border-slate-200 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-500";
                    }
                  } else if (isSelected) {
                    cardStyle =
                      "border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-100 dark:ring-indigo-500";
                    badgeStyle = "bg-indigo-600 text-white";
                  }

                  return (
                    <button
                      key={optKey}
                      type="button"
                      disabled={isPracticeSubmitted}
                      onClick={() => handleSelectOption(optKey)}
                      className={`flex w-full gap-3.5 rounded-xl border p-4 text-left text-sm transition ${
                        isImageOnlyWithoutMeta ? "items-center" : "items-start"
                      } ${cardStyle}`}
                    >
                      <span
                        className={`${
                          isImageOnlyWithoutMeta ? "" : "mt-0.5"
                        }inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${badgeStyle}`}
                      >
                        {optKey}
                      </span>
                      <div className="flex-1 space-y-1.5">
                        {optImgs.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            {optImgs.map((imgSrc, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={imgSrc}
                                alt={`選項 (${optKey}) 附圖 ${imgIdx + 1}`}
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
                        {isPracticeSubmitted && (
                          <div className="flex items-center gap-2 pt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                            <span>
                              全站選答率：{currentQuestion.stats[optKey] ?? 0}%
                            </span>
                            {optionOrder === "random" &&
                              currentQuestion.optionMapping[optKey] && (
                                <span className="text-slate-400 dark:text-slate-500">
                                  (原卷選項{" "}
                                  {currentQuestion.optionMapping[optKey]})
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 單題練習模式：立即批改結果回饋面板 */}
              {mode === "practice" && isPracticeSubmitted && (
                <div
                  className={`mt-5 rounded-xl border p-4 ${
                    currentAttempt?.isCorrect
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold">
                      {currentAttempt?.isCorrect ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          <span>
                            答對了！正確答案為 ({currentQuestion.answer})
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                          <span>
                            答錯了！您選擇 ({currentAttempt?.selectedOption}
                            )，正確答案為 ({currentQuestion.answer})
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium">
                        全站答對率：
                        {Math.round(currentQuestion.correctRate * 100)}% ·
                        本題思考耗時：{formatDuration(currentLiveElapsedMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          openAiPromptForPreparedQuestion(currentQuestion)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI 解析
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 底部換題與送出控制列 */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => goToQuestion(currentIndex - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  上一題
                </button>

                <div className="flex items-center gap-2.5">
                  {mode === "practice" && !isPracticeSubmitted && (
                    <button
                      type="button"
                      disabled={!isAnswered}
                      onClick={handleSubmitPracticeAnswer}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      確認送出答案 (Enter)
                    </button>
                  )}

                  {currentIndex < activeQuestions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => goToQuestion(currentIndex + 1)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                        mode === "mock" || isPracticeSubmitted
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {mode === "mock" && !isAnswered
                        ? "跳過 / 下一題"
                        : "下一題"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === "mock") {
                          setShowSubmitConfirmModal(true);
                        } else {
                          finalizeQuiz(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                    >
                      <Trophy className="h-4 w-4" />
                      {mode === "mock" ? "完成作答並交卷" : "查看練習總結"}
                    </button>
                  )}
                </div>
              </div>
            </article>

            {/* 鍵盤快捷鍵提示 */}
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              💡 支援鍵盤操作：按{" "}
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                A
              </kbd>
              ～
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                D
              </kbd>{" "}
              或{" "}
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                1
              </kbd>
              ～
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                4
              </kbd>{" "}
              選答案、
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                F
              </kbd>{" "}
              標記不確定、
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                ←
              </kbd>{" "}
              <kbd className="rounded border bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                →
              </kbd>{" "}
              切換題目
            </p>
          </div>

          {/* 右側：日曆網格樣式的答題完成度面板 (佔 4 欄) */}
          <aside className="lg:col-span-4">
            <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <LayoutGrid className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  答題完成度總覽
                </h2>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {progressStats.percent}% ({progressStats.answered}/
                  {progressStats.total})
                </span>
              </div>

              {/* 進度條 */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${progressStats.percent}%` }}
                />
              </div>

              {/* 圖例說明 */}
              <div className="mt-3.5 flex flex-wrap gap-3 border-b border-slate-100 pb-3 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-indigo-600" />
                  已答 ({progressStats.answered})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800" />
                  未答 ({progressStats.unanswered})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-amber-400 bg-amber-100 dark:border-amber-600 dark:bg-amber-900/60" />
                  標記不確定 ({progressStats.flagged})
                </span>
              </div>

              {/* 日曆式題號網格表格 */}
              <div className="mt-4 grid max-h-96 grid-cols-5 gap-2 overflow-y-auto p-0.5 sm:grid-cols-8 lg:grid-cols-5">
                {activeQuestions.map((q, idx) => {
                  const att = attempts[q.id];
                  const isCurrent = idx === currentIndex;
                  const hasAns =
                    att?.selectedOption !== null &&
                    att?.selectedOption !== undefined;
                  const isFlagged = Boolean(att?.isFlagged);

                  let cellStyle =
                    "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800";

                  if (mode === "practice" && att?.isSubmitted) {
                    cellStyle = att.isCorrect
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : "border-rose-500 bg-rose-600 text-white";
                  } else if (isFlagged && hasAns) {
                    cellStyle =
                      "border-amber-500 bg-amber-100 text-amber-950 font-bold dark:border-amber-600 dark:bg-amber-900/70 dark:text-amber-100";
                  } else if (isFlagged) {
                    cellStyle =
                      "border-amber-400 bg-amber-50 text-amber-800 font-bold dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
                  } else if (hasAns) {
                    cellStyle = "border-indigo-600 bg-indigo-600 text-white";
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(idx)}
                      className={`relative flex h-10 items-center justify-center rounded-xl border text-xs font-semibold transition ${cellStyle} ${
                        isCurrent
                          ? "ring-2 ring-indigo-600 ring-offset-2 dark:ring-indigo-400 dark:ring-offset-slate-900"
                          : ""
                      }`}
                      title={`跳轉至第 ${idx + 1} 題${
                        isFlagged ? " (已標記不確定)" : ""
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span
                          className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] text-white shadow-2xs"
                          aria-hidden="true"
                        >
                          !
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </main>

        {/* 模擬考交卷確認視窗 */}
        <ConfirmModal
          open={showSubmitConfirmModal}
          title="確定要交卷並結算成績嗎？"
          description={
            progressStats.unanswered > 0 || progressStats.flagged > 0
              ? `目前尚有 ${progressStats.unanswered} 題未作答、${progressStats.flagged} 題標記為不確定。確定要現在送出試卷嗎？`
              : "您已完成所有題目的作答，確定要現在送出試卷並檢視成績與錯題解析嗎？"
          }
          confirmLabel="確定交卷"
          cancelLabel="繼續檢查作答"
          variant="primary"
          onConfirm={() => finalizeQuiz(false)}
          onClose={() => setShowSubmitConfirmModal(false)}
        />

        <AiPromptModal
          context={aiPromptContext}
          onClose={() => setAiPromptContext(null)}
        />
      </div>
    );
  }

  // ==================== 畫面渲染：3. 交卷結算與錯題檢討階段 ====================
  const isSavingHistory = saveHistoryFetcher.state !== "idle";
  const savedRecordId =
    saveHistoryFetcher.data?.ok === true
      ? saveHistoryFetcher.data.recordId
      : null;

  return (
    <div className="pb-20">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/exams/${exam.examId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
            >
              <ArrowLeft className="h-4 w-4" />
              返回考卷閱覽
            </Link>

            {isSavingHistory && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在儲存測驗紀錄...
              </span>
            )}

            {!isSavingHistory && savedRecordId && (
              <Link
                to={`/history/${savedRecordId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                已保存至歷史測驗紀錄
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {summaryResult.wrongCount + summaryResult.unansweredCount > 0 && (
              <button
                type="button"
                onClick={handleRetryWrongQuestions}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-amber-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                針對本次錯題與未答重練 (
                {summaryResult.wrongCount + summaryResult.unansweredCount} 題)
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase("setup")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5" />
              重新設定並再測驗一次
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 pt-8">
        {isAutoSubmittedByTimeout && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm font-semibold text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            ⏰ 測驗規定時間已到，系統已自動為您停止作答並完成交卷結算！
          </div>
        )}

        {/* 成績與耗時總覽卡片 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-6 border-b border-slate-100 pb-6 md:flex-row md:items-center dark:border-slate-800">
            <div className="space-y-1">
              <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                {mode === "mock" ? "模擬考結算報告" : "單題練習結算報告"}
              </span>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {exam.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                題目順序：{questionOrder === "random" ? "隨機打亂" : "依原題號"}{" "}
                · 選項順序：{optionOrder === "random" ? "隨機打亂" : "依原順序"}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  本次測驗得分
                </span>
                <span
                  className={`text-4xl font-extrabold ${
                    summaryResult.score >= 70
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {summaryResult.score}
                  <span className="ml-1 text-base font-semibold">分</span>
                </span>
              </div>
            </div>
          </div>

          {/* 數據統計網格 */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-xl bg-emerald-50/70 p-4 dark:bg-emerald-950/40">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                答對題數
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                {summaryResult.correctCount}{" "}
                <span className="text-xs font-normal">
                  / {summaryResult.totalQuestions}
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-rose-50/70 p-4 dark:bg-rose-950/40">
              <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
                答錯題數
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-200">
                {summaryResult.wrongCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100/80 p-4 dark:bg-slate-800/70">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                未作答題數
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-200">
                {summaryResult.unansweredCount}
              </p>
            </div>

            <div className="rounded-xl bg-indigo-50/70 p-4 dark:bg-indigo-950/40">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                總作答耗時
              </span>
              <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-indigo-200">
                {formatDuration(summaryResult.totalElapsedMs)}
              </p>
            </div>

            <div className="rounded-xl bg-indigo-50/70 p-4 dark:bg-indigo-950/40">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                平均每題耗時
              </span>
              <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-indigo-200">
                {formatDuration(summaryResult.averageElapsedMs)}
              </p>
            </div>
          </div>

          {/* 最耗時題目提醒 */}
          {slowestQuestions.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                最耗時題目排行：
              </span>
              {slowestQuestions.map((q) => (
                <a
                  key={q.id}
                  href={`#review-q-${q.id}`}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                >
                  第 {q.displayIndex} 題 (
                  {formatDuration(attempts[q.id]?.elapsedMs ?? 0)})
                </a>
              ))}
            </div>
          )}
        </section>

        {/* 錯題檢討與逐題耗時明細 */}
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
                全部題目 ({activeQuestions.length})
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
                只看錯題與未答 (
                {summaryResult.wrongCount + summaryResult.unansweredCount})
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
                只看標記不確定 ({progressStats.flagged})
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

          {reviewedQuestions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              🎉 沒有符合此篩選條件的題目！
            </div>
          ) : (
            reviewedQuestions.map((q) => {
              const att = attempts[q.id];
              const userSelected = att?.selectedOption ?? null;
              const isCorrect = userSelected === q.answer;
              const elapsedMs = att?.elapsedMs ?? 0;
              const isSlowQuestion =
                summaryResult.averageElapsedMs > 0 &&
                elapsedMs > summaryResult.averageElapsedMs * 1.5 &&
                elapsedMs >= 5000;

              return (
                <article
                  key={q.id}
                  id={`review-q-${q.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* 題頭：對錯狀態、題號、難度、本題耗時 */}
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
                        第 {q.displayIndex} 題
                      </span>
                      {questionOrder === "random" && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          (原卷第 {q.questionNumber} 題)
                        </span>
                      )}

                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_BADGE_STYLE[q.difficulty]}`}
                      >
                        {q.difficulty}
                      </span>

                      {att?.isFlagged && (
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
                        耗時：{formatDuration(elapsedMs)}
                        {isSlowQuestion && " (耗時較長)"}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        全站答對率：{Math.round(q.correctRate * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => openAiPromptForPreparedQuestion(q)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/60"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI 解析
                      </button>
                    </div>
                  </div>

                  {/* 題幹與附圖 */}
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
                            loading="lazy"
                            className="max-h-80 rounded-xl border border-slate-200 bg-slate-50 object-contain p-2 dark:border-slate-700 dark:bg-slate-800"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 選項與作答比對 */}
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
                                      loading="lazy"
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
                </article>
              );
            })
          )}
        </section>
      </main>

      <AiPromptModal
        context={aiPromptContext}
        onClose={() => setAiPromptContext(null)}
      />
    </div>
  );
}
