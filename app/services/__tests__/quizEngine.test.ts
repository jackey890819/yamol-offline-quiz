import { describe, expect, it } from "vitest";
import {
  aggregateExamHistoryStats,
  buildQuizHistoryItems,
  calculateOverallHistoryStats,
  calculateQuizSummary,
  formatCountdown,
  formatDuration,
  prepareQuizQuestions,
  prepareSingleQuestion,
  reconstructPreparedQuestion,
} from "~/services/quizEngine";
import type {
  ExamQuestion,
  QuestionAttempt,
  QuizHistorySummary,
} from "~/types/exam";

const sampleQuestions: ExamQuestion[] = [
  {
    questionNumber: 1,
    id: 101,
    question: "第一題題幹",
    options: {
      A: "原A內容",
      B: "原B內容(正確)",
      C: "原C內容",
      D: "原D內容",
    },
    answer: "B",
    difficulty: "困難",
    correctRate: 0.32,
    stats: { A: 10, B: 50, C: 25, D: 15 },
    images: [],
    rawHtml: "",
  },
  {
    questionNumber: 2,
    id: 102,
    question: "第二題題幹",
    options: {
      A: "二A",
      B: "二B",
      C: "二C(正確)",
      D: "二D",
    },
    answer: "C",
    difficulty: "非常簡單",
    correctRate: 0.91,
    stats: { A: 3, B: 5, C: 90, D: 2 },
    images: [],
    rawHtml: "",
  },
];

describe("quizEngine", () => {
  it("當選項順序隨機打亂時，正確答案與各選項統計數據會自動重新對應", () => {
    // 固定 randomFn 回傳 0，使洗牌結果可預期：
    // ["A", "B", "C", "D"] 經 Fisher-Yates (j=0) 會變成 ["B", "C", "D", "A"]
    const prepared = prepareSingleQuestion(
      sampleQuestions[0]!,
      1,
      "random",
      () => 0
    );

    // 原本的 B 被洗到新的 A 位置
    expect(prepared.optionMapping.A).toBe("B");
    expect(prepared.options.A).toBe("原B內容(正確)");
    // 正確答案應該自動從 B 變成新的 A
    expect(prepared.answer).toBe("A");
    // 全站選答率統計也應跟著從原 B (50%) 對應到新的 A (50%)
    expect(prepared.stats.A).toBe(50);
    expect(prepared.stats.D).toBe(10); // 原 A (10%) 被洗到 D
  });

  it("當圖片選項題隨機打亂選項時，optionImages 會與答案及統計同步重新對應", () => {
    const imageOptionQuestion: ExamQuestion = {
      questionNumber: 24,
      id: 3014858,
      question:
        "Linux 作業系統中，下列何者用於儲存使用者帳號密碼之雜湊（Hash）檔案？",
      options: { A: "", B: "", C: "", D: "" },
      optionImages: {
        A: ["/exam-images/111501/passwd.jpg"],
        B: ["/exam-images/111501/shadow.jpg"],
        C: ["/exam-images/111501/password.jpg"],
        D: ["/exam-images/111501/secret.jpg"],
      },
      answer: "B",
      difficulty: "簡單",
      correctRate: 0.66,
      stats: { A: 138, B: 904, C: 97, D: 101 },
      images: [],
      rawHtml: "",
    };

    // ["A", "B", "C", "D"] 經 Fisher-Yates (j=0) 會變成 ["B", "C", "D", "A"]
    const prepared = prepareSingleQuestion(
      imageOptionQuestion,
      24,
      "random",
      () => 0
    );

    expect(prepared.answer).toBe("A");
    expect(prepared.optionMapping).toEqual({
      A: "B",
      B: "C",
      C: "D",
      D: "A",
    });
    expect(prepared.optionImages).toEqual({
      A: ["/exam-images/111501/shadow.jpg"],
      B: ["/exam-images/111501/password.jpg"],
      C: ["/exam-images/111501/secret.jpg"],
      D: ["/exam-images/111501/passwd.jpg"],
    });
    expect(prepared.stats.A).toBe(904);
    expect(prepared.images).toEqual([]);
  });

  it("支援依指定難度多選過濾題目", () => {
    const filtered = prepareQuizQuestions(sampleQuestions, {
      questionOrder: "sequential",
      optionOrder: "sequential",
      selectedDifficulties: ["困難"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(101);
  });

  it("正確計算測驗成績與各題耗時統計", () => {
    const prepared = prepareQuizQuestions(sampleQuestions, {
      questionOrder: "sequential",
      optionOrder: "sequential",
      selectedDifficulties: [],
    });

    const attempts: Record<number, QuestionAttempt> = {
      101: {
        questionId: 101,
        questionNumber: 1,
        selectedOption: "B", // 答對
        isSubmitted: true,
        isCorrect: true,
        isFlagged: false,
        elapsedMs: 12000,
      },
      102: {
        questionId: 102,
        questionNumber: 2,
        selectedOption: "A", // 答錯 (正解為 C)
        isSubmitted: true,
        isCorrect: false,
        isFlagged: true,
        elapsedMs: 8000,
      },
    };

    const summary = calculateQuizSummary(prepared, attempts);

    expect(summary.totalQuestions).toBe(2);
    expect(summary.answeredCount).toBe(2);
    expect(summary.correctCount).toBe(1);
    expect(summary.wrongCount).toBe(1);
    expect(summary.unansweredCount).toBe(0);
    expect(summary.score).toBe(50);
    expect(summary.totalElapsedMs).toBe(20000);
    expect(summary.averageElapsedMs).toBe(10000);
  });

  it("正確格式化作答耗時與倒數計時字串", () => {
    expect(formatDuration(8500)).toBe("8.5 秒");
    expect(formatDuration(12000)).toBe("12 秒");
    expect(formatDuration(84000)).toBe("1 分 24 秒");

    expect(formatCountdown(3600)).toBe("01:00:00");
    expect(formatCountdown(125)).toBe("02:05");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("可從歷史測驗快照精準還原隨機洗牌後的選項順序、答案與統計", () => {
    const shuffled = prepareSingleQuestion(
      sampleQuestions[0]!,
      5,
      "random",
      () => 0
    );
    const attempts: Record<number, QuestionAttempt> = {
      101: {
        questionId: 101,
        questionNumber: 1,
        selectedOption: "C",
        isSubmitted: true,
        isCorrect: false,
        isFlagged: true,
        elapsedMs: 9300,
      },
    };

    const items = buildQuizHistoryItems([shuffled], attempts);
    expect(items).toHaveLength(1);
    expect(items[0]?.selectedOption).toBe("C");
    expect(items[0]?.isCorrect).toBe(false);
    expect(items[0]?.isFlagged).toBe(true);
    expect(items[0]?.elapsedMs).toBe(9300);

    const reconstructed = reconstructPreparedQuestion(
      sampleQuestions[0]!,
      items[0]!
    );
    expect(reconstructed.displayIndex).toBe(5);
    expect(reconstructed.options).toEqual(shuffled.options);
    expect(reconstructed.answer).toBe(shuffled.answer);
    expect(reconstructed.stats).toEqual(shuffled.stats);
    expect(reconstructed.optionMapping).toEqual(shuffled.optionMapping);
  });

  it("正確彙整各考卷的最高分、最近得分與全域歷史統計", () => {
    const summaries: QuizHistorySummary[] = [
      {
        recordId: "rec-1",
        examId: "140603",
        examTitle: "資安概論 113",
        categoryTitle: "iPAS 資安",
        examYear: 2024,
        mode: "mock",
        isAutoSubmittedByTimeout: false,
        questionOrder: "sequential",
        optionOrder: "sequential",
        timeLimitMinutes: 60,
        completedAt: "2026-10-28T10:00:00.000Z",
        summary: {
          totalQuestions: 50,
          answeredCount: 50,
          correctCount: 45,
          wrongCount: 5,
          unansweredCount: 0,
          score: 90,
          totalElapsedMs: 600000,
          averageElapsedMs: 12000,
        },
        wrongQuestionIds: [1, 2, 3, 4, 5],
      },
      {
        recordId: "rec-2",
        examId: "140603",
        examTitle: "資安概論 113",
        categoryTitle: "iPAS 資安",
        examYear: 2024,
        mode: "practice",
        isAutoSubmittedByTimeout: false,
        questionOrder: "random",
        optionOrder: "random",
        timeLimitMinutes: null,
        completedAt: "2026-10-29T12:00:00.000Z",
        summary: {
          totalQuestions: 10,
          answeredCount: 10,
          correctCount: 8,
          wrongCount: 2,
          unansweredCount: 0,
          score: 80,
          totalElapsedMs: 120000,
          averageElapsedMs: 12000,
        },
        wrongQuestionIds: [2, 5],
      },
    ];

    const perExam = aggregateExamHistoryStats(summaries);
    expect(perExam["140603"]).toEqual({
      examId: "140603",
      attemptCount: 2,
      bestScore: 90,
      latestScore: 80,
      latestCompletedAt: "2026-10-29T12:00:00.000Z",
      latestRecordId: "rec-2",
      latestWrongCount: 2,
    });

    const overall = calculateOverallHistoryStats(summaries);
    expect(overall).toEqual({
      totalSessions: 2,
      mockSessions: 1,
      practiceSessions: 1,
      averageScore: 85,
      totalQuestions: 60,
      totalCorrect: 53,
      overallAccuracyPercent: 88,
      totalElapsedMs: 720000,
    });
  });
});
