# 阿摩線上測驗離線題庫管理與刷題系統 (`yamol-offline-quiz`)

本專案為「阿摩線上測驗 (Yamol)」離線題庫管理與刷題系統，支援從阿摩線上測驗探索與匯入考卷、同科目歷屆試題批次下載、考題附圖自動離線化、考卷閱覽（含模糊遮罩防劇透模式），以及支援單題練習與計時模擬考的刷題測驗引擎。

---

## 1. 技術棧與環境需求 (Tech Stack & Environment)

- **執行環境**：Node.js `>= 24.0.0`
- **套件管理器**：`pnpm >= 12.0.0`（固定使用 `pnpm@12.14.0`）
- **核心框架**：React 19 + React Router v8（SSR 架構，啟用 `.react-router/types` 自動路由型別生成）
- **建置工具**：Vite 8
- **樣式系統**：Tailwind CSS v4 (`@tailwindcss/vite`) + CSS Modules (`*.module.css`)
- **圖示庫**：`lucide-react`
- **測試框架**：Vitest 5
- **程式碼品質**：TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`)、ESLint 10、Prettier（含 `prettier-plugin-tailwindcss`）

---

## 2. 專案目錄架構 (Project Structure)

```text
├── app/
│   ├── components/
│   │   ├── AiPromptModal.tsx             # AI 解析提示詞產生器對話框（支援 3 種解析風格切換、統計/盲點附加與一鍵複製）
│   │   └── ConfirmModal.tsx              # 原生 <dialog> 確認對話框元件（支援 closedby="any" 與降級點擊關閉）
│   ├── routes/
│   │   ├── home.tsx                      # 首頁：考卷探索、同科目歷屆試卷批次下載、本地題庫分類管理與刪除
│   │   ├── exam-detail.tsx               # 考卷閱覽頁：完整考題瀏覽、模糊遮罩/直接顯示答案切換、難度與關鍵字過濾、AI 解析
│   │   ├── exam-quiz.tsx                 # 刷題與模擬測驗頁：單題練習模式、計時模擬考模式、鍵盤快捷鍵、作答耗時分析、錯題重練與 AI 解析
│   │   └── api.exam-export.ts            # Resource Route：將指定本地考卷匯出為標準 JSON 檔案下載
│   ├── services/
│   │   ├── __tests__/                    # Vitest 單元測試 (aiPromptBuilder.test.ts, examParser.test.ts, quizEngine.test.ts)
│   │   ├── aiPromptBuilder.ts            # AI 解析提示詞建構器：整合考科背景、高誘答陷阱選項識別與個人誤選盲點對比
│   │   ├── examParser.ts                 # 考卷網址/ID 解析、阿摩題目 HTML 清理、選項 (A)~(E) 序列提取與資料格式轉換
│   │   ├── quizEngine.ts                 # 刷題核心引擎：Fisher-Yates 洗牌、選項重排與答案/統計自動映射、成績與耗時結算
│   │   └── yamolCrawler.server.ts        # 伺服器端爬蟲與本地檔案讀寫：呼叫阿摩 API、下載附圖至本地、讀寫/刪除考卷 JSON
│   ├── styles/
│   │   └── exam-viewer.module.css        # 模糊遮罩答案動畫、長列表 content-visibility 延遲渲染、Modal 樣式
│   ├── types/
│   │   └── exam.ts                       # 考卷資料 (ExamData)、題目 (ExamQuestion)、刷題設定 (QuizConfig) 與作答紀錄型別定義
│   ├── app.css                           # 全域樣式與 Tailwind CSS v4 進入點
│   ├── root.tsx                          # 根佈局 (Layout)、HTML 語系設定 (zh-Hant-TW) 與全域 ErrorBoundary
│   └── routes.ts                         # React Router 路由表設定
├── data/
│   └── exams/
│       └── {examId}.json                 # 離線儲存的考卷標準格式 JSON 檔案
├── public/
│   └── exam-images/
│       └── {examId}/                     # 考卷題目內附圖的本地離線圖檔目錄（對應路徑 `/exam-images/{examId}/*`）
├── eslint.config.js                      # ESLint Flat Config 設定檔
├── package.json                          # 專案相依套件與常用腳本
├── react-router.config.ts                # React Router SSR 設定
├── tsconfig.json                         # TypeScript 編譯設定（路徑別名 `~/*` -> `./app/*`）
└── vite.config.ts                        # Vite 與 Vitest 建置設定
```

---

## 3. 路由結構 (Routes)

路由定義於 `app/routes.ts`：

| 路徑                        | 檔案                            | 說明                                                                                                                                           |
| :-------------------------- | :------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | `app/routes/home.tsx`           | **題庫管理中心**：支援輸入阿摩網址或考卷 ID 探索考卷、列出同科目 (`ClassifyExamAround`) 相關試卷並勾選批次下載、依科目分類檢視與管理本地題庫。 |
| `/exams/:examId`            | `app/routes/exam-detail.tsx`    | **考卷閱覽頁**：提供「模糊遮罩（滑鼠移過或點擊展開）」與「直接顯示答案」兩種模式，支援依 5 級難度篩選與關鍵字搜尋。                            |
| `/exams/:examId/quiz`       | `app/routes/exam-quiz.tsx`      | **刷題與模擬測驗頁**：分為 `setup`（設定）、`active`（作答中）、`summary`（成績結算與錯題檢討）三階段，支援單題練習與計時模擬考。              |
| `/api/exams/:examId/export` | `app/routes/api.exam-export.ts` | **考卷 JSON 匯出 API**：回傳 `exam_{examId}.json` 供使用者下載備份。                                                                           |

---

## 4. 常用開發指令 (Common Commands)

專案統一使用 `pnpm` 執行各項操作：

```bash
# 啟動本地開發伺服器 (React Router Dev Server)
pnpm dev

# 執行型別生成與 TypeScript 嚴格型別檢查
pnpm typecheck

# 執行單元測試 (單次執行)
pnpm test

# 啟動 Vitest 觀察模式 (Watch Mode)
pnpm test:watch

# 執行 ESLint 程式碼檢查
pnpm lint

# 使用 Prettier 自動格式化專案程式碼 (含 Tailwind class 排序)
pnpm format

# 建置正式環境版本 (Production Build)
pnpm build

# 啟動正式環境伺服器 (需先執行 pnpm build)
pnpm start
```

---

## 5. 開發規範與架構準則 (Development Conventions & Guidelines)

### 5.1 模組路徑與前後端隔離

- **路徑別名**：統一使用 `~/` 指向 `app/` 目錄（例如 `import type { ExamData } from "~/types/exam"`）。
- **伺服器專用模組**：凡涉及 Node.js 檔案系統 (`node:fs`, `node:path`) 或直接發起外部爬蟲請求的服務，檔名必須加上 `.server.ts` 後綴（如 `app/services/yamolCrawler.server.ts`），確保不會被打包進瀏覽器端 Bundle。
- **純函式抽離**：HTML 解析 (`examParser.ts`) 與刷題洗牌、計分邏輯 (`quizEngine.ts`) 應保持為無副作用的純函式 (Pure Functions)，並透過依賴注入（如注入 `randomFn`）維持高可測試性。

### 5.2 TypeScript 與程式碼風格

- **嚴格索引檢查**：專案啟用 `noUncheckedIndexedAccess: true`，存取陣列元素或 Record 屬性時必須處理 `undefined` 邊界情況。
- **型別匯入**：由於啟用 `verbatimModuleSyntax: true`，純型別匯入必須明確使用 `import type { ... }` 或 `import { type ... }`。
- **未使用變數**：若函式參數或解構變數刻意不使用，請以底線 `_` 開頭命名（例如 `_args`、`questions: _questions`），以符合 ESLint `@typescript-eslint/no-unused-vars` 規範。
- **格式化標準**：雙引號 (`"`)、加上分號 (`;`)、2 空白縮排、ES5 尾隨逗號，修改後可執行 `pnpm format` 自動整理。

### 5.3 資料與離線資產規範

- **考卷資料儲存**：下載後的考卷統一以 `ExamData` 格式儲存於 `data/exams/{examId}.json`。
- **圖片離線化**：爬取題目時須解析 `<img src="...">` 並下載至 `public/exam-images/{examId}/`，同時將題目中的 `images` 陣列替換為本地相對路徑 `/exam-images/{examId}/{fileName}`；刪除本地考卷時須一併清理對應的圖片資料夾。
- **選項洗牌一致性**：在刷題模式啟用「隨機打亂選項」時，必須透過 `prepareSingleQuestion` 同步更新 `options`、`answer`、`stats`（全站各選項選答率）與 `optionMapping`，確保批改與統計數據對應正確。

### 5.4 UI/UX 與現代網頁實踐

- **原生對話框**：彈出確認視窗優先使用封裝原生 `<dialog>` 的 `ConfirmModal` 元件，具備無障礙焦點管理與背景防滾動穿透 (`overscroll-behavior: contain`)。
- **長列表渲染優化**：考卷閱覽頁 (`exam-detail.tsx`) 針對首屏以下 (`idx >= 4`) 的題目卡片套用 `content-visibility: auto` 與 `contain-intrinsic-size` (`styles.deferredQuestionCard`)，並對非首屏圖片設定 `loading="lazy"`。
- **鍵盤友善操作**：刷題介面 (`exam-quiz.tsx`) 支援完整鍵盤快捷鍵（`A`~`E` 或 `1`~`5` 選擇選項、`←`/`→` 切換題目、`F` 標記不確定、`Enter` 送出答案或進入下一題），修改互動邏輯時須注意避免與輸入框 (`INPUT`/`TEXTAREA`/`SELECT`) 事件衝突。
