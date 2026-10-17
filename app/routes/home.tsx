import { BookOpen } from "lucide-react";
import type { Route } from "./+types/home";
import { listLocalExams } from "~/services/yamolCrawler.server";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "阿摩線上測驗 — 離線題庫與刷題系統" },
    {
      name: "description",
      content: "iPAS 資訊安全工程師與歷屆考古題離線練習與模擬測驗系統",
    },
  ];
}

export async function loader() {
  const exams = await listLocalExams();
  return { exams };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { exams } = loaderData;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                阿摩線上測驗 — 離線刷題系統
              </h1>
              <p className="text-xs text-slate-500">
                React Router v8 · Vite 8 · Tailwind CSS v4
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-slate-600">
            本地已收錄考卷：<span className="text-indigo-600">{exams.length}</span> 份
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-800">
            Step 1 基礎架構已就緒
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            目前已載入 {exams.length} 份本地考卷，準備進入 Step 2 實作「考卷匯入與考卷管理」介面。
          </p>
        </div>
      </main>
    </div>
  );
}
