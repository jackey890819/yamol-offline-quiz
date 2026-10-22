export type OptionKey = "A" | "B" | "C" | "D" | "E";

export type DifficultyLevel =
  "非常簡單" | "簡單" | "適中" | "困難" | "非常困難";

export const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = [
  "非常簡單",
  "簡單",
  "適中",
  "困難",
  "非常困難",
];

export type MasteryLevel = "unfamiliar" | "moderate" | "mastered";

export interface ExamQuestion {
  /** 試卷內題號 (1-based) */
  questionNumber: number;
  /** 阿摩系統內部的單題唯一 ID */
  id: number;
  /** 清理後的純文字題幹（不含開頭題號與選項） */
  question: string;
  /** 選項內容對應表 (A ~ D/E) */
  options: Partial<Record<OptionKey, string>>;
  /** 正確答案選項代號 */
  answer: OptionKey;
  /** 題目難易度 */
  difficulty: DifficultyLevel;
  /** 全站答對率 (0 ~ 1) */
  correctRate: number;
  /** 全站各選項選答百分比 (例如 { A: 11, B: 49, C: 23, D: 19 }) */
  stats: Partial<Record<OptionKey, number>>;
  /** 題目附圖路徑（優先為本地離線路徑 `/exam-images/{examId}/xxx.jpg`） */
  images: string[];
  /** 原始 HTML 字串（備查用） */
  rawHtml: string;
}

export interface ExamData {
  /** 考卷 ID (例如 "140603") */
  examId: string;
  /** 考卷完整標題 */
  title: string;
  /** 考卷西元年份 */
  year: number;
  /** 阿摩科目分類 ID */
  categoryId: number;
  /** 科目分類名稱 (例如 "iPAS◆資訊安全技術概論◆初級") */
  categoryTitle: string;
  /** 總題數 */
  totalQuestions: number;
  /** 下載至本地的 ISO 時間字串 */
  downloadedAt: string;
  /** 原始考卷網址 */
  sourceUrl: string;
  /** 題目列表 */
  questions: ExamQuestion[];
}

export interface ExamSummary {
  examId: string;
  title: string;
  year: number;
  categoryId: number;
  categoryTitle: string;
  totalQuestions: number;
  downloadedAt: string;
  sourceUrl: string;
}

export interface RelatedExamSummary {
  examId: string;
  title: string;
  year: number;
  /** 是否已經下載於本地題庫中 */
  isDownloaded: boolean;
}

export interface ExamExploreResult {
  targetExam: {
    examId: string;
    title: string;
    year: number;
    categoryId: number;
    categoryTitle: string;
    totalQuestions: number;
    isDownloaded: boolean;
  };
  relatedExams: RelatedExamSummary[];
}

export type QuizMode = "practice" | "mock";
export type OrderStrategy = "sequential" | "random";

export interface QuizConfig {
  mode: QuizMode;
  questionOrder: OrderStrategy;
  optionOrder: OrderStrategy;
  /** 單題練習模式：篩選特定難度的題目 */
  selectedDifficulties: DifficultyLevel[];
  /** 單題練習模式：作答時是否顯示該題難易度 */
  showDifficulty: boolean;
  /** 單題練習模式（預留）：作答後詢問掌握度 */
  enableMasteryTracking?: boolean;
  /** 模擬考模式：測驗時間限制（分鐘），null 代表不限時 */
  timeLimitMinutes: number | null;
}

export interface PreparedQuestion extends ExamQuestion {
  /** 在本次測驗中的顯示順序題號 (1-based) */
  displayIndex: number;
  /**
   * 顯示選項代號 -> 原始選項代號 的映射表
   * 例如當選項洗牌後，畫面上的 (A) 其實來自原本的 (C)，則 optionMapping.A === "C"
   */
  optionMapping: Partial<Record<OptionKey, OptionKey>>;
}

export interface QuestionAttempt {
  questionId: number;
  questionNumber: number;
  /** 使用者選擇的選項（對應 PreparedQuestion 上的選項代號） */
  selectedOption: OptionKey | null;
  /** 是否已送出確認（單題練習模式用） */
  isSubmitted: boolean;
  /** 是否答對 */
  isCorrect: boolean;
  /** 是否標記為不確定（模擬考模式用） */
  isFlagged: boolean;
  /** 在此題累計停留耗時 (毫秒) */
  elapsedMs: number;
  /** 熟練度自評（預留給錯題本/學習紀錄使用） */
  mastery?: MasteryLevel;
}

export interface QuizSummaryResult {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  /** 百分制得分 (0 ~ 100) */
  score: number;
  /** 總耗時 (毫秒) */
  totalElapsedMs: number;
  /** 平均每題耗時 (毫秒) */
  averageElapsedMs: number;
}
