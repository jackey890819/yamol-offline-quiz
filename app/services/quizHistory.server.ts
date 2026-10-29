import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { QuizHistoryRecord, QuizHistorySummary } from "~/types/exam";

const DATA_HISTORY_DIR = path.resolve(process.cwd(), "data", "history");

async function ensureHistoryDirectory(): Promise<void> {
  await fs.mkdir(DATA_HISTORY_DIR, { recursive: true });
}

function sanitizeRecordId(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export type CreateQuizHistoryInput = Omit<
  QuizHistoryRecord,
  "recordId" | "completedAt"
> & {
  completedAt?: string;
};

/**
 * 將單次測驗紀錄寫入本地 `data/history/{recordId}.json`
 */
export async function saveQuizHistoryRecord(
  input: CreateQuizHistoryInput
): Promise<QuizHistoryRecord> {
  await ensureHistoryDirectory();

  const now = new Date();
  const completedAt = input.completedAt ?? now.toISOString();
  const recordId = `${now.getTime()}-${crypto.randomUUID().slice(0, 8)}`;

  const record: QuizHistoryRecord = {
    ...input,
    recordId,
    completedAt,
  };

  const filePath = path.join(DATA_HISTORY_DIR, `${recordId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");

  return record;
}

/**
 * 讀取所有本地歷史測驗摘要列表（依完成時間由新到舊排序）
 */
export async function listQuizHistorySummaries(
  filterExamId?: string
): Promise<QuizHistorySummary[]> {
  await ensureHistoryDirectory();
  const entries = await fs.readdir(DATA_HISTORY_DIR, { withFileTypes: true });
  const summaries: QuizHistorySummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const content = await fs.readFile(
        path.join(DATA_HISTORY_DIR, entry.name),
        "utf-8"
      );
      const record = JSON.parse(content) as QuizHistoryRecord;
      if (!record || typeof record.recordId !== "string") continue;
      if (filterExamId && record.examId !== filterExamId) continue;

      const { items: _items, ...summary } = record;
      summaries.push(summary);
    } catch {
      // 忽略損毀的 JSON
    }
  }

  return summaries.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

/**
 * 讀取本地歷史測驗總筆數（輕量統計，供側邊導覽列徽章顯示）
 */
export async function countQuizHistoryRecords(): Promise<number> {
  await ensureHistoryDirectory();
  const entries = await fs.readdir(DATA_HISTORY_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".json")).length;
}

/**
 * 讀取單筆完整的歷史測驗紀錄（包含逐題作答快照）
 */
export async function getQuizHistoryRecord(
  recordId: string
): Promise<QuizHistoryRecord | null> {
  await ensureHistoryDirectory();
  const safeId = sanitizeRecordId(recordId);
  if (!safeId) return null;

  const filePath = path.join(DATA_HISTORY_DIR, `${safeId}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as QuizHistoryRecord;
  } catch {
    return null;
  }
}

/**
 * 刪除指定歷史測驗紀錄
 */
export async function deleteQuizHistoryRecord(
  recordId: string
): Promise<boolean> {
  await ensureHistoryDirectory();
  const safeId = sanitizeRecordId(recordId);
  if (!safeId) return false;

  const filePath = path.join(DATA_HISTORY_DIR, `${safeId}.json`);
  if (!existsSync(filePath)) return false;

  await fs.unlink(filePath);
  return true;
}

/**
 * 清空所有本地歷史測驗紀錄
 */
export async function clearAllQuizHistory(): Promise<number> {
  await ensureHistoryDirectory();
  const entries = await fs.readdir(DATA_HISTORY_DIR, { withFileTypes: true });
  let deletedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      await fs.unlink(path.join(DATA_HISTORY_DIR, entry.name));
      deletedCount += 1;
    } catch {
      // 忽略單一檔案刪除失敗
    }
  }

  return deletedCount;
}

