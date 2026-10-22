import {
  ALL_DIFFICULTY_LEVELS,
  type DifficultyLevel,
  type ExamData,
  type ExamQuestion,
  type OptionKey,
} from "~/types/exam";

export interface YamolRawItem {
  id: number;
  content: string;
  ans: string;
  examid: number;
  catid: number;
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  E?: number;
  option_number?: number;
  difficulty?: string;
  p?: number;
  year?: number;
}

export interface YamolExamListResponse {
  items?: YamolRawItem[];
  exam?: {
    id: number;
    year?: number;
    title?: string;
    catid?: number;
    itemnums?: number;
  };
  classify?: {
    id: number;
    title?: string;
    examnums?: number;
  };
}

/**
 * 從使用者輸入的網址或字串中解析出純數字的考卷 ID
 * 支援格式：
 * - "https://yamol.tw/exam/140603"
 * - "https://yamol.tw/exam/140603?foo=bar"
 * - "#140603"
 * - "140603"
 */
export function extractExamIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/yamol\.tw\/exam\/(\d+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const hashOrPlainMatch = trimmed.match(/^#?(\d+)$/);
  if (hashOrPlainMatch?.[1]) {
    return hashOrPlainMatch[1];
  }

  return null;
}

/**
 * 解析阿摩單題的 HTML 字串，提取題幹、選項 (A~E) 與圖片網址清單
 */
export function parseQuestionHtml(rawHtml: string): {
  question: string;
  options: Partial<Record<OptionKey, string>>;
  images: string[];
} {
  const images = [...rawHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((url): url is string => Boolean(url));

  const cleanText = rawHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();

  // 尋找選項標記 (A) (B) (C) (D) (E)
  const optionRegex = /\(([A-E])\)\s*/g;
  const allMatches = [...cleanText.matchAll(optionRegex)];

  // 為了防止題幹本身出現例如 "(A)" 的罕見情況，我們從最後面找尋依序遞增的 A, B, C, D(, E) 序列
  const matches = findOptionSequenceMatches(allMatches);

  let questionStem = cleanText;
  const options: Partial<Record<OptionKey, string>> = {};

  const firstMatch = matches[0];
  if (matches.length >= 2 && firstMatch && firstMatch.index !== undefined) {
    questionStem = cleanText.slice(0, firstMatch.index).trim();
    // 移除開頭題號例如 "1. " 或 "27."
    questionStem = questionStem.replace(/^\d+\.\s*/, "").trim();

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      if (!current || current.index === undefined) continue;
      const optKey = current[1] as OptionKey;
      const startIdx = current.index + current[0].length;
      const nextMatch = matches[i + 1];
      const endIdx =
        nextMatch && nextMatch.index !== undefined
          ? nextMatch.index
          : cleanText.length;
      options[optKey] = cleanText
        .slice(startIdx, endIdx)
        .replace(/\s+/g, " ")
        .trim();
    }
  } else {
    questionStem = questionStem.replace(/^\d+\.\s*/, "").trim();
  }

  return {
    question: questionStem,
    options,
    images,
  };
}

function findOptionSequenceMatches(
  matches: RegExpExecArray[]
): RegExpExecArray[] {
  if (matches.length < 2) return matches;

  // 從最後一個 (A) 開始向後匹配 A -> B -> C -> D (-> E)
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m?.[1] === "A") {
      const seq = [m];
      const expectedOrder = ["B", "C", "D", "E"];
      let nextExpectedIdx = 0;
      for (let j = i + 1; j < matches.length; j++) {
        const candidate = matches[j];
        const expectedKey = expectedOrder[nextExpectedIdx];
        if (candidate && expectedKey && candidate[1] === expectedKey) {
          seq.push(candidate);
          nextExpectedIdx++;
        }
      }
      if (seq.length >= 2) {
        return seq;
      }
    }
  }

  return matches;
}

function normalizeDifficulty(raw?: string): DifficultyLevel {
  if (raw && ALL_DIFFICULTY_LEVELS.includes(raw as DifficultyLevel)) {
    return raw as DifficultyLevel;
  }
  return "適中";
}

function normalizeAnswer(raw?: string): OptionKey {
  const upper = (raw || "A").trim().toUpperCase();
  if (["A", "B", "C", "D", "E"].includes(upper)) {
    return upper as OptionKey;
  }
  return "A";
}

/**
 * 將阿摩 API 的回應轉換為本系統標準的 ExamData 格式
 * @param examId 考卷 ID
 * @param apiData 阿摩 `/api/v3/exams/{id}/list` 回傳的 JSON
 * @param imageMap 遠端圖片網址 -> 本地離線路徑的對應表
 */
export function transformYamolApiToExamData(
  examId: string,
  apiData: YamolExamListResponse,
  imageMap: Record<string, string> = {}
): ExamData {
  const items = apiData.items ?? [];

  const questions: ExamQuestion[] = items.map((item, idx) => {
    const parsed = parseQuestionHtml(item.content || "");
    const mappedImages = parsed.images.map((url) => imageMap[url] ?? url);

    const stats: Partial<Record<OptionKey, number>> = {
      A: item.A ?? 0,
      B: item.B ?? 0,
      C: item.C ?? 0,
      D: item.D ?? 0,
    };
    if ((item.option_number ?? 4) >= 5 || (item.E && item.E > 0)) {
      stats.E = item.E ?? 0;
    }

    return {
      questionNumber: idx + 1,
      id: item.id,
      question: parsed.question,
      options: parsed.options,
      answer: normalizeAnswer(item.ans),
      difficulty: normalizeDifficulty(item.difficulty),
      correctRate: typeof item.p === "number" ? item.p : 0,
      stats,
      images: mappedImages,
      rawHtml: item.content || "",
    };
  });

  const firstItem = items[0];
  const year =
    apiData.exam?.year ?? firstItem?.year ?? new Date().getFullYear();
  const categoryId =
    apiData.exam?.catid ?? apiData.classify?.id ?? firstItem?.catid ?? 0;
  const categoryTitle = apiData.classify?.title ?? "未分類科目";
  const title = apiData.exam?.title ?? `考卷 #${examId}`;

  return {
    examId: String(examId),
    title,
    year,
    categoryId,
    categoryTitle,
    totalQuestions: questions.length,
    downloadedAt: new Date().toISOString(),
    sourceUrl: `https://yamol.tw/exam/${examId}`,
    questions,
  };
}
