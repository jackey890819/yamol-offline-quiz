import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    // 在執行 Vitest 測試時不掛載 reactRouter plugin，避免與單元測試衝突
    ...(mode === "test" ? [] : [reactRouter()]),
  ],
  resolve: {
    tsconfigPaths: true,
  },
}));
