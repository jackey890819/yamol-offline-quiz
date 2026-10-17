import { describe, expect, it } from "vitest";
import {
  calculateQuizSummary,
  formatCountdown,
  formatDuration,
  prepareQuizQuestions,
  prepareSingleQuestion,
} from "~/services/quizEngine";
import type { ExamQuestion, QuestionAttempt } from "~/types/exam";

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
});
