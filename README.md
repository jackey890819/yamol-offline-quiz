# 阿摩線上測驗離線題庫管理與刷題系統 (`yamol-offline-quiz`)

一個為國考、公職、教師甄試與各類證照考生打造的**離線題庫管理與全功能刷題系統**。支援直接從阿摩線上測驗匯入試卷、同科目歷屆試題批次下載、考題附圖自動離線化保存，並提供防劇透閱讀與沉浸式模擬考刷題體驗。

---

## ✨ 核心特色

### 1. 考卷探索與批次下載

- **智慧解析**：支援貼上阿摩測驗網址或輸入考卷 ID 自動解析並下載。
- **同科關聯推薦**：自動取得同科目 (`ClassifyExamAround`) 歷屆相關試卷清單，支援多選批次一鍵下載。
- **完整離線化**：考題內含的圖片會自動下載至本機儲存，離線無網路環境也能正常顯示題目與圖表。
- **題庫分類管理**：依科目/類別自動分類歸納本地題庫，支援刪除與標準 JSON 格式匯出備份。

### 2. 防劇透考卷閱覽模式

- **模糊遮罩答案**：預設啟用防劇透模式，正解與全站答題統計預設模糊化處理，滑鼠懸停或點擊即可清晰檢視。
- **多維度題目篩選**：支援依難度（超簡單、簡單、中等、困難、超難）與關鍵字快速過濾考題。
- **長列表效能優化**：採用 CSS `content-visibility: auto` 與圖片延遲載入（Lazy Loading），百題大卷也能流暢滾動。

### 3. 全功能刷題測驗引擎

- **雙測驗模式**：
  - **單題練習**：作答後即時對答案，立即掌握正解與解析。
  - **計時模擬考**：支援自訂倒數計時，全卷交卷後自動計算得分、作答率與各題作答耗時。
- **真隨機洗牌**：支援打亂題目順序與隨機打亂選項順序（自動映射統計百分比與正確解答）。
- **鍵盤友善操作**：支援全鍵盤快捷鍵（`A`~`E` / `1`~`5` 選擇選項、`←`/`→` 切換題目、`F` 標記不確定、`Enter` 送出答案或切換下一題）。
- **作答報告與錯題重練**：交卷後提供綜合統計報表，並可針對「錯題與不確定標記題目」一鍵開啟專門重練模式。

### 4. 智慧 AI 解析提示詞生成器

- **內建三種風格**：
  - **深入剖析**：觀念溯源、解題思路推導與記憶口訣整理。
  - **速記要點**：精簡條列核心考點與易混淆點。
  - **陷阱辨析**：鎖定高誘答選項，分析命題陷阱與常見盲點。
- **個人作答對比**：自動將使用者選錯的選項與全站高誘答選項帶入 Prompt，一鍵複製後可直接貼給 ChatGPT / Claude / Gemini 生成針對性解說。

---

## 🛠️ 技術棧 (Tech Stack)

- **執行環境**：Node.js `>= 24.0.0`
- **套件管理器**：pnpm `12.14.0`
- **核心框架**：React 19 + React Router v8 (SSR 架構)
- **建置工具**：Vite 8
- **樣式系統**：Tailwind CSS v4 (`@tailwindcss/vite`) + CSS Modules
- **圖示庫**：`lucide-react`
- **測試框架**：Vitest 5
- **程式碼規範**：TypeScript 5.9 (Strict Mode)、ESLint 10、Prettier

---

## 🚀 快速上手 (Getting Started)

### 前置需求

請確保已安裝相容版本的 Node.js 與 pnpm：

- **Node.js** `>= 24.0.0`
- **pnpm** `12.14.0` (建議搭配 Corepack：`corepack enable && corepack prepare pnpm@12.14.0 --activate`)

### 安裝與啟動

1. **安裝相依套件**：

   ```bash
   pnpm install
   ```

2. **啟動本機開發伺服器**：
   ```bash
   pnpm dev
   ```
   伺服器啟動後，使用瀏覽器開啟提示的網址（預設為 `http://localhost:5173`）。

---

## 📋 常用指令 (Scripts)

| 指令              | 說明                                                      |
| :---------------- | :-------------------------------------------------------- |
| `pnpm dev`        | 啟動開發伺服器 (React Router Dev Server)                  |
| `pnpm build`      | 建置正式環境版本 (Production Build)                       |
| `pnpm start`      | 啟動正式環境伺服器 (需先執行 `pnpm build`)                |
| `pnpm typecheck`  | 產生路由型別定義並執行 TypeScript 嚴格型別檢查            |
| `pnpm test`       | 執行 Vitest 單元測試                                      |
| `pnpm test:watch` | 啟動 Vitest 測試觀察模式 (Watch Mode)                     |
| `pnpm lint`       | 執行 ESLint 程式碼靜態分析                                |
| `pnpm format`     | 使用 Prettier 自動排版程式碼 (含 Tailwind CSS class 排序) |

---

## 📁 專案目錄結構

```text
├── app/
│   ├── components/
│   │   ├── AiPromptModal.tsx             # AI 解析提示詞產生器彈窗 (三種風格/盲點分析)
│   │   └── ConfirmModal.tsx              # 原生 <dialog> 確認對話框元件
│   ├── routes/
│   │   ├── home.tsx                      # 首頁：題庫探索、批次下載、本地題庫管理
│   │   ├── exam-detail.tsx               # 考卷閱覽頁：防劇透模糊遮罩、題目篩選
│   │   ├── exam-quiz.tsx                 # 刷題與模擬測驗頁：單題練習/模擬考/成績結算
│   │   └── api.exam-export.ts            # Resource Route：考卷 JSON 匯出 API
│   ├── services/
│   │   ├── aiPromptBuilder.ts            # AI 提示詞建構器
│   │   ├── examParser.ts                 # 網址/ID 解析與題目 HTML 結構化清理
│   │   ├── quizEngine.ts                 # 洗牌演算法、答案映射與成績耗時結算引擎
│   │   └── yamolCrawler.server.ts        # 伺服器端爬蟲與本地 JSON/圖檔離線儲存
│   ├── styles/
│   │   └── exam-viewer.module.css        # 模糊遮罩動畫與長列表渲染優化樣式
│   ├── types/
│   │   └── exam.ts                       # 資料型別定義 (ExamData, ExamQuestion 等)
│   ├── app.css                           # 全域樣式與 Tailwind CSS v4 設定
│   ├── root.tsx                          # 根元件與 HTML 語系設定 (zh-Hant-TW)
│   └── routes.ts                         # React Router 路由表
├── data/
│   └── exams/                            # 離線儲存的考卷 JSON 檔案 (`{examId}.json`)
└── public/
    └── exam-images/                      # 考卷題目的離線附圖目錄 (`/exam-images/{examId}/*`)
```

---

## ⌨️ 刷題鍵盤快捷鍵指南

在刷題測驗頁面中，可使用以下快捷鍵操作提升刷題效率：

| 按鍵                   | 功能說明                                   |
| :--------------------- | :----------------------------------------- |
| `A` ~ `E` 或 `1` ~ `5` | 快速選擇對應的選項 (A) 至 (E)              |
| `F`                    | 切換「不確定 / 待複習」標記                |
| `Enter`                | 送出當前答案（單題練習模式）或切換至下一題 |
| `←` / `→`              | 前往上一題 / 下一題                        |

---

## 🔒 隱私與免責聲明

- 本專案僅供個人學術研究、準備考試與離線練習使用。
- 試題與相關版權歸原出題單位及阿摩線上測驗所有，請勿將下載之離線題庫用於任何商業用途。
