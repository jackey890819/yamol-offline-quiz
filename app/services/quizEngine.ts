import type {
  ExamQuestion,
  OptionKey,
  PreparedQuestion,
  QuestionAttempt,
  QuizConfig,
  QuizSummaryResult,
} from "~/types/exam";

const STANDARD_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];

/**
 * Fisher-Yates 洗牌演算法（支援注入自訂 random 函式以便單元測試）
 */
export function shuffleArray<T>(
  items: readonly T[],
  randomFn: () => number = Math.random
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }
  return copy;
}

/**
 * 針對單一題目的選項進行順序處理（保持原序或隨機打亂），
 * 並自動重新對應正確答案 (`answer`) 與全站選答率統計 (`stats`)
 */
export function prepareSingleQuestion(
  question: ExamQuestion,
  displayIndex: number,
  optionOrder: QuizConfig["optionOrder"],
  randomFn: () => number = Math.random
): PreparedQuestion {
  const originalKeys = STANDARD_KEYS.filter(
    (key) => question.options[key] !== undefined
  );

  if (optionOrder === "sequential" || originalKeys.length <= 1) {
    const identityMapping: Partial<Record<OptionKey, OptionKey>> = {};
    for (const k of originalKeys) {
      identityMapping[k] = k;
    }
    return {
      ...question,
      displayIndex,
      optionMapping: identityMapping,
    };
  }

  // 將原始選項 Key 洗牌，依序放入新的 A, B, C, D... 位置
  const shuffledOriginalKeys = shuffleArray(originalKeys, randomFn);

  const newOptions: Partial<Record<OptionKey, string>> = {};
  const newStats: Partial<Record<OptionKey, number>> = {};
  const optionMapping: Partial<Record<OptionKey, OptionKey>> = {};
  let newAnswer: OptionKey = question.answer;

  originalKeys.forEach((displayKey, idx) => {
    const sourceKey = shuffledOriginalKeys[idx]!;
    optionMapping[displayKey] = sourceKey;
    newOptions[displayKey] = question.options[sourceKey];
    if (question.stats[sourceKey] !== undefined) {
      newStats[displayKey] = question.stats[sourceKey];
    }
    if (sourceKey === question.answer) {
      newAnswer = displayKey;
    }
  });

  return {
    ...question,
    displayIndex,
    options: newOptions,
    answer: newAnswer,
    stats: newStats,
    optionMapping,
  };
}

/**
 * 根據刷題設定（難度篩選、題目順序、選項順序）產生測驗題目列表
 */
export function prepareQuizQuestions(
  questions: readonly ExamQuestion[],
  config: Pick<
    QuizConfig,
    "questionOrder" | "optionOrder" | "selectedDifficulties"
  >,
  randomFn: () => number = Math.random
): PreparedQuestion[] {
  const filtered =
    config.selectedDifficulties.length > 0
      ? questions.filter((q) =>
          config.selectedDifficulties.includes(q.difficulty)
        )
      : [...questions];

  const orderedQuestions =
    config.questionOrder === "random"
      ? shuffleArray(filtered, randomFn)
      : [...filtered];

  return orderedQuestions.map((q, idx) =>
    prepareSingleQuestion(q, idx + 1, config.optionOrder, randomFn)
  );
}

/**
 * 計算測驗結果摘要（分數、答對題數、未答題數、總耗時與平均耗時）
 */
export function calculateQuizSummary(
  questions: readonly PreparedQuestion[],
  attempts: Readonly<Record<number, QuestionAttempt>>
): QuizSummaryResult {
  const totalQuestions = questions.length;
  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let totalElapsedMs = 0;

  for (const q of questions) {
    const attempt = attempts[q.id];
    if (attempt) {
      totalElapsedMs += attempt.elapsedMs;
      if (attempt.selectedOption !== null) {
        answeredCount++;
        if (attempt.selectedOption === q.answer) {
          correctCount++;
        } else {
          wrongCount++;
        }
      }
    }
  }

  const unansweredCount = totalQuestions - answeredCount;
  const score =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const averageElapsedMs =
    totalQuestions > 0 ? Math.round(totalElapsedMs / totalQuestions) : 0;

  return {
    totalQuestions,
    answeredCount,
    correctCount,
    wrongCount,
    unansweredCount,
    score,
    totalElapsedMs,
    averageElapsedMs,
  };
}

/**
 * 將毫秒數格式化為易讀的耗時字串（例如 "8.5 秒" 或 "1 分 24 秒"）
 */
export function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  if (safeMs < 60_000) {
    const sec = (safeMs / 1000).toFixed(1).replace(/\.0$/, "");
    return `${sec} 秒`;
  }
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

/**
 * 將剩餘秒數格式化為倒數計時字串 (MM:SS 或 HH:MM:SS)
 */
export function formatCountdown(remainingSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(remainingSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

