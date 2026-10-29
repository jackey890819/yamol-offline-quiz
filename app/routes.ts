import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/app-shell.tsx", [
    index("routes/home.tsx"),
    route("import", "routes/exam-import.tsx"),
    route("history", "routes/quiz-history.tsx"),
    route("history/:recordId", "routes/quiz-history-detail.tsx"),
    route("exams/:examId", "routes/exam-detail.tsx"),
    route("exams/:examId/quiz", "routes/exam-quiz.tsx"),
  ]),
  route("api/exams/:examId/export", "routes/api.exam-export.ts"),
] satisfies RouteConfig;
