import type { Route } from "./+types/api.exam-export";
import { getLocalExam } from "~/services/yamolCrawler.server";

export async function loader({ params }: Route.LoaderArgs) {
  const exam = await getLocalExam(params.examId);
  if (!exam) {
    throw new Response("找不到該份本地考卷", { status: 404 });
  }

  const filename = `exam_${exam.examId}.json`;
  return new Response(JSON.stringify(exam, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
