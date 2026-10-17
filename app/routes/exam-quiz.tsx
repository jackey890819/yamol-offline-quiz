import { Link } from "react-router";
import { ArrowLeft, Play } from "lucide-react";
import type { Route } from "./+types/exam-quiz";
import { getLocalExam } from "~/services/yamolCrawler.server";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.exam?.title ?? "刷題測驗";
  return [{ title: `刷題測驗 — ${title}` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const exam = await getLocalExam(params.examId);
  if (!exam) {
    throw new Response(`找不到本地考卷 #${params.examId}`, { status: 404 });
  }
  return { exam };
}

export default function ExamQuiz({ loaderData }: Route.ComponentProps) {
  const { exam } = loaderData;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          to={`/exams/${exam.examId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          返回考卷閱覽
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-2xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Play className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">
            {exam.title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            刷題與模擬測驗系統將於 Step 3 實作完成。
          </p>
        </div>
      </div>
    </div>
  );
}
