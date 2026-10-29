import { describe, expect, it } from "vitest";
import {
  collectParsedQuestionImages,
  extractExamIdFromInput,
  normalizeExamData,
  parseQuestionHtml,
  transformYamolApiToExamData,
} from "~/services/examParser";
import type { ExamData } from "~/types/exam";

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
      expect(parsed.optionImages).toEqual({});
      expect(parsed.options.D).toBe("格式字串攻擊(Format String Overflow)");
    });

    it("將選項內的純圖片歸屬至對應的 optionImages 而非題幹 images", () => {
      const html =
        '<p>24. Linux 作業系統中，下列何者用於儲存使用者帳號密碼之雜湊 （Hash）檔案？ (A)<img src="https://img.yamol.tw/file/63607883bb4a3.jpg#s-125,42" style="width: 125px;" data-filename="">  (B)<img src="https://img.yamol.tw/file/6360789d8dd5d.jpg#s-133,35" style="width: 133px;" data-filename=""> (C) <img src="https://img.yamol.tw/file/636078af96c43.jpg#s-147,34" style="width: 147px;" data-filename="">(D)<img src="https://img.yamol.tw/file/636078c27b983.jpg#s-112,35" style="width: 112px;" data-filename=""> </p>';
      const parsed = parseQuestionHtml(html);

      expect(parsed.question).toBe(
        "Linux 作業系統中，下列何者用於儲存使用者帳號密碼之雜湊 （Hash）檔案？"
      );
      expect(parsed.images).toEqual([]);
      expect(parsed.options).toEqual({
        A: "",
        B: "",
        C: "",
        D: "",
      });
      expect(parsed.optionImages).toEqual({
        A: ["https://img.yamol.tw/file/63607883bb4a3.jpg#s-125,42"],
        B: ["https://img.yamol.tw/file/6360789d8dd5d.jpg#s-133,35"],
        C: ["https://img.yamol.tw/file/636078af96c43.jpg#s-147,34"],
        D: ["https://img.yamol.tw/file/636078c27b983.jpg#s-112,35"],
      });
      expect(collectParsedQuestionImages(parsed)).toHaveLength(4);
    });

    it("支援圖文混合選項（部分選項純文字、部分選項含附圖與文字）", () => {
      const html =
        '<div>20. 關於注入攻擊（Injection Attack）的敘述，下列何者錯誤？ (A) 使用參數化查詢(B) 建立加密通道 (C)<img src="https://img.yamol.tw/file/66382e6d2f7cf.jpg#s-543,29">此語法也是一種注入攻擊 (D)<img src="https://img.yamol.tw/file/66382e77886f4.jpg#s-539,26">此語法也是一種注入攻擊</div>';
      const parsed = parseQuestionHtml(html);

      expect(parsed.images).toEqual([]);
      expect(parsed.options).toEqual({
        A: "使用參數化查詢",
        B: "建立加密通道",
        C: "此語法也是一種注入攻擊",
        D: "此語法也是一種注入攻擊",
      });
      expect(parsed.optionImages).toEqual({
        C: ["https://img.yamol.tw/file/66382e6d2f7cf.jpg#s-543,29"],
        D: ["https://img.yamol.tw/file/66382e77886f4.jpg#s-539,26"],
      });
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

    it("將選項內的遠端圖片網址替換為本地離線路徑並存入 optionImages", () => {
      const mockApi = {
        exam: { id: 111501, year: 2022, title: "測試考卷", catid: 6299 },
        classify: { id: 6299, title: "資安技術概論" },
        items: [
          {
            id: 3014858,
            content:
              '<p>24. 密碼雜湊檔？ (A)<img src="https://img.yamol.tw/file/a.jpg"> (B)<img src="https://img.yamol.tw/file/b.jpg"> (C)<img src="https://img.yamol.tw/file/c.jpg"> (D)<img src="https://img.yamol.tw/file/d.jpg"></p>',
            ans: "B",
            examid: 111501,
            catid: 6299,
            A: 10,
            B: 70,
            C: 10,
            D: 10,
            difficulty: "簡單",
            p: 0.66,
          },
        ],
      };

      const imageMap = {
        "https://img.yamol.tw/file/a.jpg": "/exam-images/111501/a.jpg",
        "https://img.yamol.tw/file/b.jpg": "/exam-images/111501/b.jpg",
        "https://img.yamol.tw/file/c.jpg": "/exam-images/111501/c.jpg",
        "https://img.yamol.tw/file/d.jpg": "/exam-images/111501/d.jpg",
      };

      const result = transformYamolApiToExamData("111501", mockApi, imageMap);
      expect(result.questions[0]?.images).toEqual([]);
      expect(result.questions[0]?.optionImages).toEqual({
        A: ["/exam-images/111501/a.jpg"],
        B: ["/exam-images/111501/b.jpg"],
        C: ["/exam-images/111501/c.jpg"],
        D: ["/exam-images/111501/d.jpg"],
      });
    });
  });

  describe("normalizeExamData", () => {
    it("自動將舊版 JSON 誤放入 images 的選項圖片還原至對應的 optionImages", () => {
      const legacyExam: ExamData = {
        examId: "111501",
        title: "舊版考卷",
        year: 2022,
        categoryId: 6299,
        categoryTitle: "iPAS◆資訊安全技術概論◆初級",
        totalQuestions: 1,
        downloadedAt: "2026-01-01T00:00:00.000Z",
        sourceUrl: "https://yamol.tw/exam/111501",
        questions: [
          {
            questionNumber: 24,
            id: 3014858,
            question:
              "Linux 作業系統中，下列何者用於儲存使用者帳號密碼之雜湊 （Hash）檔案？",
            options: { A: "", B: "", C: "", D: "" },
            answer: "B",
            difficulty: "簡單",
            correctRate: 0.662,
            stats: { A: 138, B: 904, C: 97, D: 101 },
            images: [
              "/exam-images/111501/63607883bb4a3.jpg",
              "/exam-images/111501/6360789d8dd5d.jpg",
              "/exam-images/111501/636078af96c43.jpg",
              "/exam-images/111501/636078c27b983.jpg",
            ],
            rawHtml:
              '<p>24. Linux 作業系統中，下列何者用於儲存使用者帳號密碼之雜湊 （Hash）檔案？ (A)<img src="https://img.yamol.tw/file/63607883bb4a3.jpg#s-125,42"> (B)<img src="https://img.yamol.tw/file/6360789d8dd5d.jpg#s-133,35"> (C)<img src="https://img.yamol.tw/file/636078af96c43.jpg#s-147,34"> (D)<img src="https://img.yamol.tw/file/636078c27b983.jpg#s-112,35"></p>',
          },
        ],
      };

      const normalized = normalizeExamData(legacyExam);
      const q = normalized.questions[0]!;
      expect(q.images).toEqual([]);
      expect(q.optionImages).toEqual({
        A: ["/exam-images/111501/63607883bb4a3.jpg"],
        B: ["/exam-images/111501/6360789d8dd5d.jpg"],
        C: ["/exam-images/111501/636078af96c43.jpg"],
        D: ["/exam-images/111501/636078c27b983.jpg"],
      });
    });
  });
});
