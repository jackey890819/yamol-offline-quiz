import type { DifficultyLevel, OptionKey } from "~/types/exam";

export type AiPromptStyle = "comprehensive" | "concise" | "socratic";

export interface AiPromptQuestionContext {
  /** 考卷完整標題 */
  examTitle: string;
  /** 考卷科目分類名稱 */
  categoryTitle: string;
  /** 考卷西元年份 */
  examYear?: number;
  /** 畫面顯示題號 */
  questionNumber: number;
  /** 原卷題號（若在隨機打亂題號模式下與顯示題號不同時可提供） */
  originalQuestionNumber?: number;
  /** 題幹文字 */
  question: string;
  /** 選項內容對應表 (A ~ E) */
  options: Partial<Record<OptionKey, string>>;
  /** 正確答案選項代號 */
  answer: OptionKey;
  /** 題目難易度 */
  difficulty: DifficultyLevel;
  /** 全站答對率 (0 ~ 1) */
  correctRate: number;
  /** 全站各選項選答百分比 */
  stats: Partial<Record<OptionKey, number>>;
  /** 題目附圖路徑清單 */
  images: string[];
  /** 使用者於測驗中選擇的選項（null 代表未作答，undefined 代表單純閱覽考卷） */
  userSelectedOption?: OptionKey | null;
}

export interface AiPromptBuildOptions {
  /** 解析深度與風格（預設為 comprehensive 完整詳解） */
  style?: AiPromptStyle;
  /** 是否包含全站答對率與各選項選答分布（協助 AI 識別高誘答陷阱選項，預設 true） */
  includeCrowdStats?: boolean;
  /** 若有使用者作答紀錄，是否包含於提示詞中（協助 AI 針對誤選盲點加強解析，預設 true） */
  includeUserAttempt?: boolean;
}

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D", "E"];

/**
 * 找出全站選答率最高的「錯誤誘答選項」（選答率需 >= 15% 才視為顯著誘答陷阱）
 */
export function findTopDistractor(
  options: Partial<Record<OptionKey, string>>,
  answer: OptionKey,
  stats: Partial<Record<OptionKey, number>>
): { key: OptionKey; text: string; pct: number } | null {
  let topKey: OptionKey | null = null;
  let topPct = -1;

  for (const key of OPTION_KEYS) {
    if (key === answer || options[key] === undefined) continue;
    const pct = stats[key] ?? 0;
    if (pct >= 15 && pct > topPct) {
      topKey = key;
      topPct = pct;
    }
  }

  if (!topKey) return null;
  return {
    key: topKey,
    text: options[topKey] ?? "",
    pct: topPct,
  };
}

/**
 * 根據考題資訊、使用者作答紀錄與全站統計，組合結構化的 AI 詢問提示詞 (Prompt)
 */
export function buildAiExplanationPrompt(
  context: AiPromptQuestionContext,
  buildOptions: AiPromptBuildOptions = {}
): string {
  const {
    style = "comprehensive",
    includeCrowdStats = true,
    includeUserAttempt = true,
  } = buildOptions;

  const availableKeys = OPTION_KEYS.filter(
    (k) => context.options[k] !== undefined
  );
  const correctOptionText = context.options[context.answer] ?? "";
  const correctRatePct = Math.round(context.correctRate * 100);

  const hasUserAttempt =
    includeUserAttempt &&
    context.userSelectedOption !== undefined &&
    context.userSelectedOption !== null;
  const isUserWrong =
    hasUserAttempt && context.userSelectedOption !== context.answer;
  const userSelectedKey = hasUserAttempt ? context.userSelectedOption : null;
  const userSelectedText = userSelectedKey
    ? (context.options[userSelectedKey] ?? "")
    : "";

  const topDistractor = includeCrowdStats
    ? findTopDistractor(context.options, context.answer, context.stats)
    : null;

  const lines: string[] = [];

  // 1. 角色設定與任務開場
  lines.push(
    `你是一位精通「${context.categoryTitle}」領域的專業考試輔導老師。我正在複習「${context.examTitle}」的歷屆試題，請幫我深入解析以下這道選擇題：`
  );
  lines.push("");

  // 2. 考題完整資訊區塊
  lines.push("## 【考題資訊】");
  const questionNumLabel =
    context.originalQuestionNumber &&
    context.originalQuestionNumber !== context.questionNumber
      ? `第 ${context.questionNumber} 題（原卷第 ${context.originalQuestionNumber} 題）`
      : `第 ${context.questionNumber} 題`;

  lines.push(`- **出處考卷**：${context.examTitle}`);
  lines.push(`- **科目分類**：${context.categoryTitle}`);
  lines.push(`- **題號**：${questionNumLabel}`);
  lines.push("");

  lines.push("### 題幹");
  lines.push(context.question.trim());
  if (context.images.length > 0) {
    lines.push(
      `> ⚠️ 備註：本題包含 ${context.images.length} 張考題附圖（若我有附上圖片請一併參考；若無，請先就題幹與選項文字進行原理推導）。`
    );
  }
  lines.push("");

  lines.push("### 選項");
  for (const key of availableKeys) {
    const optText = context.options[key] ?? "";
    const statSuffix =
      includeCrowdStats && context.stats[key] !== undefined
        ? `  *(全站選答率：${context.stats[key]}%)*`
        : "";
    lines.push(`- (${key}) ${optText}${statSuffix}`);
  }
  lines.push("");

  // 3. 答案與作答／統計背景區塊
  lines.push("## 【答案與作答情況】");
  lines.push(`- **官方正確答案**：(${context.answer}) ${correctOptionText}`);

  if (hasUserAttempt && userSelectedKey) {
    if (isUserWrong) {
      lines.push(
        `- **我的作答選擇**：(${userSelectedKey}) ${userSelectedText} ❌（答錯，請特別幫我釐清為何此選項不正確）`
      );
    } else {
      lines.push(
        `- **我的作答選擇**：(${userSelectedKey}) ${userSelectedText} ✅（雖然答對，但希望能確認完整觀念與其他選項的錯誤原因）`
      );
    }
  } else if (includeUserAttempt && context.userSelectedOption === null) {
    lines.push("- **我的作答選擇**：未作答（作答時對此題沒有把握）");
  }

  if (includeCrowdStats) {
    lines.push(
      `- **題目難度與數據**：難度「${context.difficulty}」，全站平均答對率 ${correctRatePct}%`
    );
    if (topDistractor) {
      lines.push(
        `- **高誘答陷阱選項**：全站有高達 ${topDistractor.pct}% 的考生誤選 (${topDistractor.key})「${topDistractor.text}」`
      );
    }
  }
  lines.push("");

  // 4. 根據選擇的解析風格給出結構化輸出要求
  lines.push("## 【請依下列結構提供解析】");

  if (style === "concise") {
    lines.push(
      "請以**精煉、條列式**的方式快速破題，幫助我在考前快速掌握重點："
    );
    lines.push(
      `1. **破題關鍵與正解原因**：用 2～3 句話指出題幹關鍵字，並說明為何標準答案是 (${context.answer})。`
    );
    lines.push(
      "2. **各選項一句話勘誤**：逐一列出其餘錯誤選項，用一句話點出該選項錯在哪個字詞或概念。"
    );
    if (isUserWrong && userSelectedKey) {
      lines.push(
        `3. **盲點提醒**：針對我誤選的 (${userSelectedKey}) 與正解 (${context.answer}) 進行一句話對比。`
      );
    }
  } else if (style === "socratic") {
    lines.push(
      "請以**深度觀念教學與舉一反三**的方式為我講解，確保我徹底融會貫通："
    );
    lines.push(
      `1. **背景知識與核心原理**：先由淺入深介紹本題背後的專有名詞、法規條文或系統運作原理，再推導出為何正確答案是 (${context.answer})。`
    );
    lines.push(
      "2. **逐一選項深度剖析**：詳細解釋每個選項（A～D）的定義、適用情境，以及錯誤選項是如何設計誘答陷阱的。"
    );
    if (isUserWrong && userSelectedKey) {
      lines.push(
        `3. **個人盲點突破**：我作答時誤選了 (${userSelectedKey})，請深入分析這兩個概念的本質差異，幫我建立正確的區辨標準。`
      );
    } else if (topDistractor) {
      lines.push(
        `3. **高誘答陷阱拆解**：針對全站 ${topDistractor.pct}% 考生誤選的 (${topDistractor.key})，請特別比較它與正解 (${context.answer}) 的差異。`
      );
    }
    lines.push(
      "4. **同考點延伸練習題**：最後請根據本題的核心考點，幫我額外設計 1 題類似的單選練習題（並將答案與簡短解析放在最後），讓我測試自己是否已經完全學會。"
    );
  } else {
    // 預設：comprehensive（完整詳解＋逐項破題）
    lines.push(
      `1. **核心考點與正解解析**：點出本題測驗的核心觀念（如相關原理、標準或法規依據），並清楚解釋為什麼正確答案是 (${context.answer})。`
    );
    lines.push(
      "2. **各選項逐一破題**：請逐一分析每一個選項（包含正確與錯誤選項），明確指出錯誤選項「錯在哪裡」（例如：張冠李戴了哪個名詞的定義、哪個敘述與事實相反，或要如何修正才會變成正確敘述）。"
    );
    if (isUserWrong && userSelectedKey) {
      lines.push(
        `3. **我的誤選盲點釐清**：我當時選擇了 (${userSelectedKey})，請特別針對 (${userSelectedKey}) 與正解 (${context.answer}) 進行重點比較，說明為什麼容易混淆以及如何區分。`
      );
    } else if (topDistractor) {
      lines.push(
        `3. **常見誘答陷阱比較**：全站有 ${topDistractor.pct}% 的人誤選 (${topDistractor.key})，請特別比較 (${topDistractor.key}) 與正解 (${context.answer}) 容易讓人混淆的地方。`
      );
    }
    lines.push(
      `${isUserWrong || topDistractor ? "4" : "3"}. **考點重點整理與記憶訣竅**：請用簡明條列或對照表整理本題相關的易混淆概念，提供一個好記的判斷準則或口訣，幫助我下次看到類似題目能秒殺作答。`
    );
  }

  return lines.join("\n");
}

