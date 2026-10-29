import { describe, expect, it } from "vitest";
import {
  type AiPromptQuestionContext,
  buildAiExplanationPrompt,
  findTopDistractor,
} from "~/services/aiPromptBuilder";

const baseContext: AiPromptQuestionContext = {
  examTitle: "113年 iPAS 資訊安全工程師-初級能力鑑定_科目1：資訊安全管理概論",
  categoryTitle: "iPAS◆資訊安全技術概論◆初級",
  examYear: 2024,
  questionNumber: 5,
  question: "下列何者不是機密性（Confidentiality）的主要控制措施？",
  options: {
    A: "資料加密（Encryption）",
    B: "存取控制清單（ACL）",
    C: "數位簽章（Digital Signature）確認來源不可否認性",
    D: "資料遮罩（Data Masking）",
  },
  answer: "C",
  difficulty: "困難",
  correctRate: 0.42,
  stats: {
    A: 8,
    B: 15,
    C: 42,
    D: 35,
  },
  images: [],
};

describe("aiPromptBuilder", () => {
  it("能正確找出全站選答率最高的錯誤誘答選項 (>= 15%)", () => {
    const top = findTopDistractor(
      baseContext.options,
      baseContext.answer,
      baseContext.stats
    );
    expect(top).toEqual({
      key: "D",
      text: "資料遮罩（Data Masking）",
      pct: 35,
    });
  });

  it("當所有錯誤選項選答率皆低於 15% 時，findTopDistractor 回傳 null", () => {
    const top = findTopDistractor(baseContext.options, "C", {
      A: 2,
      B: 3,
      C: 92,
      D: 3,
    });
    expect(top).toBeNull();
  });

  it("預設產生完整詳解提示詞，包含考卷背景、選項選答率與高誘答陷阱提醒", () => {
    const prompt = buildAiExplanationPrompt(baseContext);

    expect(prompt).toContain("iPAS◆資訊安全技術概論◆初級");
    expect(prompt).toContain(
      "113年 iPAS 資訊安全工程師-初級能力鑑定_科目1：資訊安全管理概論"
    );
    expect(prompt).toContain(
      "官方正確答案**：(C) 數位簽章（Digital Signature）確認來源不可否認性"
    );
    expect(prompt).toContain("*(全站選答率：35%)*");
    expect(prompt).toContain(
      "高誘答陷阱選項**：全站有高達 35% 的考生誤選 (D)「資料遮罩（Data Masking）」"
    );
    expect(prompt).toContain("各選項逐一破題");
  });

  it("當使用者答錯時，會在提示詞中強調使用者的誤選選項並要求針對盲點比較", () => {
    const prompt = buildAiExplanationPrompt({
      ...baseContext,
      userSelectedOption: "D",
    });

    expect(prompt).toContain(
      "我的作答選擇**：(D) 資料遮罩（Data Masking） ❌（答錯，請特別幫我釐清為何此選項不正確）"
    );
    expect(prompt).toContain(
      "我的誤選盲點釐清**：我當時選擇了 (D)，請特別針對 (D) 與正解 (C) 進行重點比較"
    );
  });

  it("支援切換為精簡速讀 (concise) 與深度教學 (socratic) 風格，以及關閉統計數據", () => {
    const concisePrompt = buildAiExplanationPrompt(baseContext, {
      style: "concise",
      includeCrowdStats: false,
    });

    expect(concisePrompt).toContain("精煉、條列式");
    expect(concisePrompt).not.toContain("全站選答率");

    const socraticPrompt = buildAiExplanationPrompt(baseContext, {
      style: "socratic",
    });
    expect(socraticPrompt).toContain("同考點延伸練習題");
  });

  it("當題目含有附圖時，會在提示詞中加入附圖備註提醒", () => {
    const promptWithImg = buildAiExplanationPrompt({
      ...baseContext,
      images: ["/exam-images/140603/q5.png"],
    });

    expect(promptWithImg).toContain("本題包含 1 張考題附圖");
  });

  it("當題目為圖片選項時，會在選項中標示 [圖片選項] 並提示選項附圖數量", () => {
    const promptWithOptionImgs = buildAiExplanationPrompt({
      ...baseContext,
      options: { A: "", B: "", C: "", D: "" },
      optionImages: {
        A: ["/exam-images/111501/a.jpg"],
        B: ["/exam-images/111501/b.jpg"],
        C: ["/exam-images/111501/c.jpg"],
        D: ["/exam-images/111501/d.jpg"],
      },
      answer: "B",
    });

    expect(promptWithOptionImgs).toContain("本題包含 4 張選項附圖");
    expect(promptWithOptionImgs).toContain("- (A) [圖片選項]");
    expect(promptWithOptionImgs).toContain("官方正確答案**：(B) [圖片選項]");
  });
});
