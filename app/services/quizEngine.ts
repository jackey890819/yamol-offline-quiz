import type {
  ExamHistoryStats,
  ExamQuestion,
  OptionKey,
  PreparedQuestion,
  QuestionAttempt,
  QuizConfig,
  QuizHistoryItemSnapshot,
  QuizHistorySummary,
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
 * 並自動重新對應選項附圖 (`optionImages`)、正確答案 (`answer`) 與全站選答率統計 (`stats`)
 */
export function prepareSingleQuestion(
  question: ExamQuestion,
  displayIndex: number,
  optionOrder: QuizConfig["optionOrder"],
  randomFn: () => number = Math.random
): PreparedQuestion {
  const originalKeys = STANDARD_KEYS.filter(
    (key) =>
      question.options[key] !== undefined ||
      (question.optionImages?.[key]?.length ?? 0) > 0
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
  const newOptionImages: Partial<Record<OptionKey, string[]>> = {};
  const newStats: Partial<Record<OptionKey, number>> = {};
  const optionMapping: Partial<Record<OptionKey, OptionKey>> = {};
  let newAnswer: OptionKey = question.answer;

  originalKeys.forEach((displayKey, idx) => {
    const sourceKey = shuffledOriginalKeys[idx]!;
    optionMapping[displayKey] = sourceKey;
    newOptions[displayKey] = question.options[sourceKey] ?? "";
    const sourceImages = question.optionImages?.[sourceKey];
    if (sourceImages && sourceImages.length > 0) {
      newOptionImages[displayKey] = [...sourceImages];
    }
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
    optionImages:
      Object.keys(newOptionImages).length > 0 ? newOptionImages : undefined,
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

/**
 * 將當次測驗題目與作答狀態轉換為可序列化儲存的精簡歷史快照
 */
export function buildQuizHistoryItems(
  questions: readonly PreparedQuestion[],
  attempts: Readonly<Record<number, QuestionAttempt>>
): QuizHistoryItemSnapshot[] {
  return questions.map((q) => {
    const att = attempts[q.id];
    const selectedOption = att?.selectedOption ?? null;
    return {
      questionId: q.id,
      questionNumber: q.questionNumber,
      displayIndex: q.displayIndex,
      optionMapping: { ...q.optionMapping },
      answer: q.answer,
      selectedOption,
      isCorrect: selectedOption !== null && selectedOption === q.answer,
      isFlagged: Boolean(att?.isFlagged),
      elapsedMs: Math.max(0, Math.round(att?.elapsedMs ?? 0)),
    };
  });
}

/**
 * 根據本地考卷原題與歷史快照中的 `optionMapping`，精準還原當時測驗畫面上的選項順序、附圖、正解與選答統計
 */
export function reconstructPreparedQuestion(
  question: ExamQuestion,
  snapshot: QuizHistoryItemSnapshot
): PreparedQuestion {
  const mappedDisplayKeys = STANDARD_KEYS.filter(
    (key) => snapshot.optionMapping[key] !== undefined
  );

  if (mappedDisplayKeys.length === 0) {
    return prepareSingleQuestion(question, snapshot.displayIndex, "sequential");
  }

  const newOptions: Partial<Record<OptionKey, string>> = {};
  const newOptionImages: Partial<Record<OptionKey, string[]>> = {};
  const newStats: Partial<Record<OptionKey, number>> = {};
  const optionMapping: Partial<Record<OptionKey, OptionKey>> = {};
  let newAnswer: OptionKey = snapshot.answer;

  for (const displayKey of mappedDisplayKeys) {
    const sourceKey = snapshot.optionMapping[displayKey];
    if (!sourceKey) continue;
    optionMapping[displayKey] = sourceKey;

    if (
      question.options[sourceKey] !== undefined ||
      (question.optionImages?.[sourceKey]?.length ?? 0) > 0
    ) {
      newOptions[displayKey] = question.options[sourceKey] ?? "";
    }
    const sourceImages = question.optionImages?.[sourceKey];
    if (sourceImages && sourceImages.length > 0) {
      newOptionImages[displayKey] = [...sourceImages];
    }
    if (question.stats[sourceKey] !== undefined) {
      newStats[displayKey] = question.stats[sourceKey];
    }
    if (sourceKey === question.answer) {
      newAnswer = displayKey;
    }
  }

  return {
    ...question,
    displayIndex: snapshot.displayIndex,
    options: newOptions,
    optionImages:
      Object.keys(newOptionImages).length > 0 ? newOptionImages : undefined,
    answer: newAnswer,
    stats: newStats,
    optionMapping,
  };
}

/**
 * 依考卷 ID 彙整歷史測驗摘要統計（假設傳入或內部自動依時間排序）
 */
export function aggregateExamHistoryStats(
  summaries: readonly QuizHistorySummary[]
): Record<string, ExamHistoryStats> {
  const sorted = [...summaries].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt)
  );
  const map: Record<string, ExamHistoryStats> = {};

  for (const item of sorted) {
    const existing = map[item.examId];
    const wrongPlusUnanswered =
      item.summary.wrongCount + item.summary.unansweredCount;

    if (!existing) {
      map[item.examId] = {
        examId: item.examId,
        attemptCount: 1,
        bestScore: item.summary.score,
        latestScore: item.summary.score,
        latestCompletedAt: item.completedAt,
        latestRecordId: item.recordId,
        latestWrongCount: wrongPlusUnanswered,
      };
    } else {
      existing.attemptCount += 1;
      if (item.summary.score > existing.bestScore) {
        existing.bestScore = item.summary.score;
      }
    }
  }

  return map;
}

export interface OverallHistoryStats {
  totalSessions: number;
  mockSessions: number;
  practiceSessions: number;
  averageScore: number;
  totalQuestions: number;
  totalCorrect: number;
  overallAccuracyPercent: number;
  totalElapsedMs: number;
}

/**
 * 計算全域歷史測驗統計指標（供歷史紀錄儀表板使用）
 */
export function calculateOverallHistoryStats(
  summaries: readonly QuizHistorySummary[]
): OverallHistoryStats {
  const totalSessions = summaries.length;
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      mockSessions: 0,
      practiceSessions: 0,
      averageScore: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      overallAccuracyPercent: 0,
      totalElapsedMs: 0,
    };
  }

  let mockSessions = 0;
  let practiceSessions = 0;
  let scoreSum = 0;
  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalElapsedMs = 0;

  for (const item of summaries) {
    if (item.mode === "mock") {
      mockSessions += 1;
    } else {
      practiceSessions += 1;
    }
    scoreSum += item.summary.score;
    totalQuestions += item.summary.totalQuestions;
    totalCorrect += item.summary.correctCount;
    totalElapsedMs += item.summary.totalElapsedMs;
  }

  return {
    totalSessions,
    mockSessions,
    practiceSessions,
    averageScore: Math.round(scoreSum / totalSessions),
    totalQuestions,
    totalCorrect,
    overallAccuracyPercent:
      totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0,
    totalElapsedMs,
  };
}
