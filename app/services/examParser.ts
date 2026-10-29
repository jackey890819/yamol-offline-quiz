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

const IMG_TOKEN_PREFIX = "\uE000__YAMOL_IMG_";
const IMG_TOKEN_SUFFIX = "__\uE001";

function buildImgToken(index: number): string {
  return `${IMG_TOKEN_PREFIX}${index}${IMG_TOKEN_SUFFIX}`;
}

function extractTokensFromSegment(
  segment: string,
  extractedUrls: readonly string[],
  replaceWithSpace: boolean
): { text: string; images: string[] } {
  const tokenRegex = /\uE000__YAMOL_IMG_(\d+)__\uE001/g;
  const images: string[] = [];

  for (const match of segment.matchAll(tokenRegex)) {
    const idx = Number(match[1]);
    const url = extractedUrls[idx];
    if (url) {
      images.push(url);
    }
  }

  const text = segment.replace(tokenRegex, replaceWithSpace ? " " : "");
  return { text, images };
}

function extractRawImgUrls(rawHtml: string): {
  htmlWithTokens: string;
  extractedUrls: string[];
} {
  const extractedUrls: string[] = [];
  const htmlWithTokens = rawHtml.replace(
    /<img\b[^>]*?\s+src=(?:"([^"]+)"|'([^']+)')[^>]*>/gi,
    (_fullMatch, doubleQuoted?: string, singleQuoted?: string) => {
      const rawUrl = (doubleQuoted ?? singleQuoted ?? "").trim();
      if (!rawUrl) return "";
      const decodedUrl = rawUrl.replace(/&amp;/g, "&");
      const idx = extractedUrls.length;
      extractedUrls.push(decodedUrl);
      return buildImgToken(idx);
    }
  );
  return { htmlWithTokens, extractedUrls };
}

/**
 * 解析阿摩單題的 HTML 字串，提取題幹、選項 (A~E)、題幹附圖與各選項專屬附圖
 */
export function parseQuestionHtml(rawHtml: string): {
  question: string;
  options: Partial<Record<OptionKey, string>>;
  optionImages: Partial<Record<OptionKey, string[]>>;
  images: string[];
} {
  const { htmlWithTokens, extractedUrls } = extractRawImgUrls(rawHtml);

  const cleanText = htmlWithTokens
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

  let questionStem: string;
  let stemImages: string[];
  const options: Partial<Record<OptionKey, string>> = {};
  const optionImages: Partial<Record<OptionKey, string[]>> = {};

  const firstMatch = matches[0];
  if (matches.length >= 2 && firstMatch && firstMatch.index !== undefined) {
    const rawStemSlice = cleanText.slice(0, firstMatch.index);
    const extractedStem = extractTokensFromSegment(
      rawStemSlice,
      extractedUrls,
      false
    );
    stemImages = extractedStem.images;
    // 移除開頭題號例如 "1. " 或 "27."
    questionStem = extractedStem.text
      .trim()
      .replace(/^\d+\.\s*/, "")
      .trim();

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

      const rawOptSlice = cleanText.slice(startIdx, endIdx);
      const extractedOpt = extractTokensFromSegment(
        rawOptSlice,
        extractedUrls,
        true
      );
      options[optKey] = extractedOpt.text.replace(/\s+/g, " ").trim();
      if (extractedOpt.images.length > 0) {
        optionImages[optKey] = extractedOpt.images;
      }
    }
  } else {
    const extractedStem = extractTokensFromSegment(
      cleanText,
      extractedUrls,
      false
    );
    stemImages = extractedStem.images;
    questionStem = extractedStem.text
      .trim()
      .replace(/^\d+\.\s*/, "")
      .trim();
  }

  return {
    question: questionStem,
    options,
    optionImages,
    images: stemImages,
  };
}

/**
 * 彙整單題解析結果中的所有圖片網址（包含題幹附圖與各選項附圖）
 */
export function collectParsedQuestionImages(parsed: {
  images: readonly string[];
  optionImages?: Partial<Record<OptionKey, string[]>>;
}): string[] {
  const urls: string[] = [...parsed.images];
  if (parsed.optionImages) {
    for (const key of ["A", "B", "C", "D", "E"] as const) {
      const optUrls = parsed.optionImages[key];
      if (optUrls) {
        urls.push(...optUrls);
      }
    }
  }
  return urls;
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
    const mappedOptionImages: Partial<Record<OptionKey, string[]>> = {};
    for (const key of ["A", "B", "C", "D", "E"] as const) {
      const optUrls = parsed.optionImages[key];
      if (optUrls && optUrls.length > 0) {
        mappedOptionImages[key] = optUrls.map((url) => imageMap[url] ?? url);
      }
    }

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
      ...(Object.keys(mappedOptionImages).length > 0
        ? { optionImages: mappedOptionImages }
        : {}),
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

function getSafeFileNameFromUrl(remoteUrl: string): string | null {
  try {
    const urlObj = new URL(remoteUrl);
    const baseName = urlObj.pathname.split("/").pop();
    if (!baseName) return null;
    return baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  } catch {
    const fallbackBase = remoteUrl
      .split("#")[0]
      ?.split("?")[0]
      ?.split("/")
      .pop();
    if (!fallbackBase) return null;
    return fallbackBase.replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}

/**
 * 將既有已儲存的考卷資料正規化：
 * 若早期版本將選項內的 `<img>` 混入題幹 `images` 中，透過 `rawHtml` 自動拆回對應的 `optionImages`，
 * 並保留原本已下載的本地離線圖片路徑。
 */
export function normalizeExamData(exam: ExamData): ExamData {
  let hasChanged = false;

  const normalizedQuestions = exam.questions.map((q) => {
    if (q.optionImages !== undefined || !q.rawHtml || q.images.length === 0) {
      return q;
    }

    const { extractedUrls } = extractRawImgUrls(q.rawHtml);
    if (extractedUrls.length === 0) {
      return q;
    }

    const reparsed = parseQuestionHtml(q.rawHtml);
    if (Object.keys(reparsed.optionImages).length === 0) {
      return q;
    }

    // 建立遠端網址 -> 本地圖片路徑的映射表
    const urlToLocalMap = new Map<string, string>();
    extractedUrls.forEach((remoteUrl, idx) => {
      const safeName = getSafeFileNameFromUrl(remoteUrl);
      const matchedByName = safeName
        ? q.images.find(
            (img) => img === remoteUrl || img.endsWith(`/${safeName}`)
          )
        : undefined;
      if (matchedByName) {
        urlToLocalMap.set(remoteUrl, matchedByName);
      } else if (q.images.length === extractedUrls.length && q.images[idx]) {
        urlToLocalMap.set(remoteUrl, q.images[idx]);
      }
    });

    const resolveImg = (url: string) => urlToLocalMap.get(url) ?? url;
    const mappedStemImages = reparsed.images.map(resolveImg);
    const mappedOptionImages: Partial<Record<OptionKey, string[]>> = {};

    for (const key of ["A", "B", "C", "D", "E"] as const) {
      const optUrls = reparsed.optionImages[key];
      if (optUrls && optUrls.length > 0) {
        mappedOptionImages[key] = optUrls.map(resolveImg);
      }
    }

    hasChanged = true;
    return {
      ...q,
      question: reparsed.question,
      options: reparsed.options,
      optionImages: mappedOptionImages,
      images: mappedStemImages,
    };
  });

  if (!hasChanged) {
    return exam;
  }

  return {
    ...exam,
    questions: normalizedQuestions,
  };
}
