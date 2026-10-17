import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("exams/:examId", "routes/exam-detail.tsx"),
  route("exams/:examId/quiz", "routes/exam-quiz.tsx"),
  route("api/exams/:examId/export", "routes/api.exam-export.ts"),
] satisfies RouteConfig;
