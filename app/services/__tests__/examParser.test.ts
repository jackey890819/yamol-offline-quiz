import { describe, expect, it } from "vitest";
import {
  extractExamIdFromInput,
  parseQuestionHtml,
  transformYamolApiToExamData,
} from "~/services/examParser";

describe("examParser", () => {
  describe("extractExamIdFromInput", () => {
    it("支援從完整阿摩網址擷取考卷 ID", () => {
      expect(extractExamIdFromInput("https://yamol.tw/exam/140603")).toBe(
        "140603"
      );
      expect(
        extractExamIdFromInput("https://yamol.tw/exam/140603?mode=test")
      ).toBe("140603");
    });

    it("支援純數字或井字號開頭的考卷 ID", () => {
      expect(extractExamIdFromInput("140603")).toBe("140603");
      expect(extractExamIdFromInput("  #133436  ")).toBe("133436");
    });

    it("對無效輸入回傳 null", () => {
      expect(extractExamIdFromInput("")).toBeNull();
      expect(extractExamIdFromInput("https://google.com")).toBeNull();
      expect(extractExamIdFromInput("abc")).toBeNull();
    });
  });

  describe("parseQuestionHtml", () => {
    it("正確解析一般文字選擇題與帶括號的專有名詞", () => {
      const html =
        "<p>2. 關於阻斷式服務攻擊(DoS/DDoS)的敘述，下列何者最為適切？ (A) 攻擊者通常使用單一來源發起攻擊 (B) 僅會造成網路流量變慢，但不會癱瘓主機 (C) 主要目的是耗盡目標系統的資源 (D) 只能經由惡意程式散播來實現</p>";
      const parsed = parseQuestionHtml(html);

      expect(parsed.question).toBe(
        "關於阻斷式服務攻擊(DoS/DDoS)的敘述，下列何者最為適切？"
      );
      expect(parsed.options).toEqual({
        A: "攻擊者通常使用單一來源發起攻擊",
        B: "僅會造成網路流量變慢，但不會癱瘓主機",
        C: "主要目的是耗盡目標系統的資源",
        D: "只能經由惡意程式散播來實現",
      });
      expect(parsed.images).toEqual([]);
    });

    it("正確擷取題幹內的附圖網址並分離選項", () => {
      const html =
        '<p>27. 如附圖所示，為一 C/C++程式碼，請判斷該程式碼有下列哪一種類的緩衝區溢位 (Buffer Overflow)弱點？<br><img src="https://img.yamol.tw/file/6a7ad7e29b723.jpg">(A) 堆疊型緩衝區溢位(Stack-based Buffer Overflow) (B) 整數溢位(Integer Overflow) (C) 堆積型緩衝區溢位(Heap-based Buffer Overflow) (D) 格式字串攻擊(Format String Overflow)</p>';
      const parsed = parseQuestionHtml(html);

      expect(parsed.question).toBe(
        "如附圖所示，為一 C/C++程式碼，請判斷該程式碼有下列哪一種類的緩衝區溢位 (Buffer Overflow)弱點？"
      );
      expect(parsed.images).toEqual([
        "https://img.yamol.tw/file/6a7ad7e29b723.jpg",
      ]);
      expect(parsed.options.D).toBe("格式字串攻擊(Format String Overflow)");
    });
  });

  describe("transformYamolApiToExamData", () => {
    it("將 API 回應轉為標準 ExamData 並替換離線圖片路徑", () => {
      const mockApi = {
        exam: {
          id: 140603,
          year: 2026,
          title:
            "115年 - 115-1資訊安全工程師能力鑑定初級試題：資訊安全技術概論#140603",
          catid: 6299,
        },
        classify: {
          id: 6299,
          title: "iPAS◆資訊安全技術概論◆初級",
        },
        items: [
          {
            id: 3923601,
            content:
              '<p>27. 圖片題測試<br><img src="https://img.yamol.tw/file/6a7ad7e29b723.jpg">(A) 選項一 (B) 選項二 (C) 選項三 (D) 選項四</p>',
            ans: "D",
            examid: 140603,
            catid: 6299,
            A: 33,
            B: 13,
            C: 12,
            D: 34,
            difficulty: "困難",
            p: 0.233,
          },
        ],
      };

      const imageMap = {
        "https://img.yamol.tw/file/6a7ad7e29b723.jpg":
          "/exam-images/140603/6a7ad7e29b723.jpg",
      };

      const result = transformYamolApiToExamData("140603", mockApi, imageMap);

      expect(result.examId).toBe("140603");
      expect(result.categoryTitle).toBe("iPAS◆資訊安全技術概論◆初級");
      expect(result.totalQuestions).toBe(1);
      expect(result.questions[0]?.images).toEqual([
        "/exam-images/140603/6a7ad7e29b723.jpg",
      ]);
      expect(result.questions[0]?.answer).toBe("D");
      expect(result.questions[0]?.difficulty).toBe("困難");
    });
  });
});
