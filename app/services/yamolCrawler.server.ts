import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  collectParsedQuestionImages,
  extractExamIdFromInput,
  normalizeExamData,
  parseQuestionHtml,
  transformYamolApiToExamData,
  type YamolExamListResponse,
} from "~/services/examParser";
import type {
  ExamData,
  ExamExploreResult,
  ExamSummary,
  RelatedExamSummary,
} from "~/types/exam";

const DATA_EXAMS_DIR = path.resolve(process.cwd(), "data", "exams");
const PUBLIC_IMAGES_DIR = path.resolve(process.cwd(), "public", "exam-images");

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Origin: "https://yamol.tw",
  Referer: "https://yamol.tw/",
};

interface ClassifyExamAroundResponse {
  list?: Array<{
    id: number;
    title: string;
    year: number;
  }>;
  total?: number;
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_EXAMS_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_IMAGES_DIR, { recursive: true });
}

export function isExamDownloadedLocally(examId: string): boolean {
  const filePath = path.join(DATA_EXAMS_DIR, `${examId}.json`);
  return existsSync(filePath);
}

/**
 * 探索指定網址或考卷 ID：
 * 1. 查詢該考卷是否存在、取得標題、科目與題數
 * 2. 同時查詢同科目底下的其他相關試卷
 * 3. 比對本地 `data/exams/` 標記哪些考卷已經下載過
 */
export async function exploreExamByInput(
  input: string
): Promise<ExamExploreResult> {
  const examId = extractExamIdFromInput(input);
  if (!examId) {
    throw new Error(
      "無法識別考卷編號，請輸入完整網址（如 https://yamol.tw/exam/140603）或純數字 ID（如 140603）"
    );
  }

  await ensureDirectories();

  const listUrl = `https://api.yamol.tw/api/v3/exams/${examId}/list`;
  const res = await fetch(listUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: `https://yamol.tw/exam/${examId}`,
    },
  });

  if (!res.ok) {
    throw new Error(`查詢考卷 #${examId} 失敗 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as YamolExamListResponse;
  if (!data.items || data.items.length === 0) {
    throw new Error(
      `找不到考卷 #${examId} 的題目資料，請確認該考卷編號是否正確`
    );
  }

  const categoryId =
    data.exam?.catid ?? data.classify?.id ?? data.items[0]?.catid ?? 0;
  const categoryTitle = data.classify?.title ?? "未分類科目";
  const title = data.exam?.title ?? `考卷 #${examId}`;
  const year =
    data.exam?.year ?? data.items[0]?.year ?? new Date().getFullYear();

  const relatedExams: RelatedExamSummary[] = [];

  if (categoryId > 0) {
    try {
      const aroundUrl = `https://api.yamol.tw/api/v3/exams/ClassifyExamAround?catid=${categoryId}&examid=${examId}&range=50`;
      const aroundRes = await fetch(aroundUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: `https://yamol.tw/exam/${examId}`,
        },
      });
      if (aroundRes.ok) {
        const aroundData =
          (await aroundRes.json()) as ClassifyExamAroundResponse;
        for (const item of aroundData.list ?? []) {
          const itemIdStr = String(item.id);
          if (itemIdStr === examId) continue;
          relatedExams.push({
            examId: itemIdStr,
            title: item.title,
            year: item.year,
            isDownloaded: isExamDownloadedLocally(itemIdStr),
          });
        }
      }
    } catch {
      // 同科目試卷清單若查詢失敗不阻斷主流程
    }
  }

  return {
    targetExam: {
      examId,
      title,
      year,
      categoryId,
      categoryTitle,
      totalQuestions: data.items.length,
      isDownloaded: isExamDownloadedLocally(examId),
    },
    relatedExams,
  };
}

/**
 * 下載題目附圖至本地 `public/exam-images/{examId}/` 資料夾，回傳遠端網址 -> 本地路徑映射表
 */
async function downloadExamImages(
  examId: string,
  imageUrls: string[]
): Promise<Record<string, string>> {
  const uniqueUrls = [...new Set(imageUrls)];
  const imageMap: Record<string, string> = {};

  if (uniqueUrls.length === 0) {
    return imageMap;
  }

  const examImageDir = path.join(PUBLIC_IMAGES_DIR, examId);
  await fs.mkdir(examImageDir, { recursive: true });

  await Promise.all(
    uniqueUrls.map(async (remoteUrl, idx) => {
      try {
        const urlObj = new URL(remoteUrl);
        const baseName =
          path.basename(urlObj.pathname) || `image_${idx + 1}.jpg`;
        const safeFileName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const localFilePath = path.join(examImageDir, safeFileName);
        const publicPath = `/exam-images/${examId}/${safeFileName}`;

        if (!existsSync(localFilePath)) {
          const imgRes = await fetch(remoteUrl, {
            headers: {
              ...DEFAULT_HEADERS,
              Referer: `https://yamol.tw/exam/${examId}`,
            },
          });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            await fs.writeFile(localFilePath, buffer);
          } else {
            return;
          }
        }
        imageMap[remoteUrl] = publicPath;
      } catch {
        // 若單張圖片下載失敗則保留原遠端網址
      }
    })
  );

  return imageMap;
}

/**
 * 下載單份考卷（含圖片離線化）並儲存至 `data/exams/{examId}.json`
 */
export async function downloadAndSaveExam(
  examIdInput: string
): Promise<ExamData> {
  const examId = extractExamIdFromInput(examIdInput);
  if (!examId) {
    throw new Error(`無效的考卷編號: ${examIdInput}`);
  }

  await ensureDirectories();

  const listUrl = `https://api.yamol.tw/api/v3/exams/${examId}/list`;
  const res = await fetch(listUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: `https://yamol.tw/exam/${examId}`,
    },
  });

  if (!res.ok) {
    throw new Error(`下載考卷 #${examId} 失敗 (HTTP ${res.status})`);
  }

  const apiData = (await res.json()) as YamolExamListResponse;
  if (!apiData.items || apiData.items.length === 0) {
    throw new Error(`考卷 #${examId} 無題目內容`);
  }

  // 收集所有題目中的圖片網址（包含題幹附圖與各選項附圖）並下載至本地
  const allImageUrls: string[] = [];
  for (const item of apiData.items) {
    const parsed = parseQuestionHtml(item.content || "");
    allImageUrls.push(...collectParsedQuestionImages(parsed));
  }

  const imageMap = await downloadExamImages(examId, allImageUrls);
  const examData = transformYamolApiToExamData(examId, apiData, imageMap);

  const filePath = path.join(DATA_EXAMS_DIR, `${examId}.json`);
  await fs.writeFile(filePath, JSON.stringify(examData, null, 2), "utf-8");

  return examData;
}

/**
 * 批次下載多份考卷
 */
export async function downloadMultipleExams(examIds: string[]): Promise<{
  succeeded: ExamSummary[];
  failed: Array<{ examId: string; error: string }>;
}> {
  const succeeded: ExamSummary[] = [];
  const failed: Array<{ examId: string; error: string }> = [];

  for (const rawId of examIds) {
    try {
      const data = await downloadAndSaveExam(rawId);
      const { questions: _questions, ...summary } = data;
      succeeded.push(summary);
    } catch (err) {
      failed.push({
        examId: rawId,
        error: err instanceof Error ? err.message : "未知錯誤",
      });
    }
  }

  return { succeeded, failed };
}

/**
 * 讀取本地所有已下載的考卷摘要列表
 */
export async function listLocalExams(): Promise<ExamSummary[]> {
  await ensureDirectories();
  const entries = await fs.readdir(DATA_EXAMS_DIR, { withFileTypes: true });
  const summaries: ExamSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const content = await fs.readFile(
        path.join(DATA_EXAMS_DIR, entry.name),
        "utf-8"
      );
      const data = JSON.parse(content) as ExamData;
      const { questions: _questions, ...summary } = data;
      summaries.push(summary);
    } catch {
      // 忽略損毀的 JSON
    }
  }

  // 依年份由新到舊、考卷 ID 由大到小排序
  return summaries.sort(
    (a, b) => b.year - a.year || Number(b.examId) - Number(a.examId)
  );
}

/**
 * 讀取單份本地考卷的完整資料
 */
export async function getLocalExam(examId: string): Promise<ExamData | null> {
  await ensureDirectories();
  const safeId = extractExamIdFromInput(examId);
  if (!safeId) return null;

  const filePath = path.join(DATA_EXAMS_DIR, `${safeId}.json`);
  if (!existsSync(filePath)) return null;

  const content = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as ExamData;
  return normalizeExamData(parsed);
}

/**
 * 刪除本地考卷與對應的離線圖片資料夾
 */
export async function deleteLocalExam(examId: string): Promise<boolean> {
  await ensureDirectories();
  const safeId = extractExamIdFromInput(examId);
  if (!safeId) return false;

  const filePath = path.join(DATA_EXAMS_DIR, `${safeId}.json`);
  const imageDir = path.join(PUBLIC_IMAGES_DIR, safeId);

  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
  if (existsSync(imageDir)) {
    await fs.rm(imageDir, { recursive: true, force: true });
  }
  return true;
}
