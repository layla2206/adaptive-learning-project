import { describe, it, expect } from "vitest";
import { restoreFromHistory, mapHistoryRowsToMessages, type HistoryRow } from "./sessionHistory";

describe("restoreFromHistory", () => {
  it("returns null for no history at all", () => {
    expect(restoreFromHistory([])).toBeNull();
  });

  it("returns null when the last message's tag isn't a resumable stage (falls back to a fresh diagnose)", () => {
    const rows: HistoryRow[] = [{ text: "Nice work!", tag: "Result" }];
    expect(restoreFromHistory(rows)).toBeNull();
  });

  it("returns null when the last message has no tag at all", () => {
    const rows: HistoryRow[] = [{ text: "some untagged row" }];
    expect(restoreFromHistory(rows)).toBeNull();
  });

  it("resumes into explain-shown after a Grounded Explanation", () => {
    const rows: HistoryRow[] = [{ text: "Here's the explanation.", tag: "Grounded Explanation" }];
    const result = restoreFromHistory(rows);
    expect(result?.stage).toBe("explain-shown");
    expect(result?.messages).toHaveLength(1);
  });

  it.each(["Worked Example", "Hands-on Task", "Analogy", "Diagram", "Mind Map"])(
    "resumes into retry-shown after a %s retry message",
    (tag) => {
      const rows: HistoryRow[] = [{ text: "Retry content.", tag }];
      expect(restoreFromHistory(rows)?.stage).toBe("retry-shown");
    }
  );

  it("resumes into check-ask after a Hint", () => {
    const rows: HistoryRow[] = [{ text: "feedback text", tag: "Hint", hintsUsed: 1, maxHints: 2 }];
    expect(restoreFromHistory(rows)?.stage).toBe("check-ask");
  });

  it("converts every row to a message, not just the last one", () => {
    const rows: HistoryRow[] = [
      { text: "first", tag: "Grounded Explanation" },
      { text: "second", tag: "Feedback" },
      { text: "third", tag: "Grounded Explanation" },
    ];
    expect(restoreFromHistory(rows)?.messages).toHaveLength(3);
  });

  describe("Foundations Gate resumption", () => {
    const fullFoundationsRow: HistoryRow = {
      text: "What is a variable?",
      tag: "Foundations Question",
      questionId: "q-abc123",
      conceptId: "variables",
      conceptLabel: "Variables & Assignment",
      conceptIndex: 1,
      totalConcepts: 4,
      questionText: "What is a variable?",
      options: ["A", "B", "C", "D"],
    };

    it("resumes into foundations-question with foundationsCurrent populated from the row", () => {
      const result = restoreFromHistory([fullFoundationsRow]);
      expect(result?.stage).toBe("foundations-question");
      expect(result?.foundationsCurrent).toEqual({
        question_id: "q-abc123",
        concept_id: "variables",
        concept_label: "Variables & Assignment",
        concept_index: 1,
        text: "What is a variable?",
        options: ["A", "B", "C", "D"],
      });
      expect(result?.foundationsTotal).toBe(4);
    });

    it("concept_index 0 (the first concept) is NOT treated as missing -- a falsy-value bug this code explicitly guards against with `!== undefined`", () => {
      const result = restoreFromHistory([{ ...fullFoundationsRow, conceptIndex: 0 }]);
      expect(result?.foundationsCurrent?.concept_index).toBe(0);
    });

    it("leaves foundationsCurrent undefined if a required field is missing, even though the stage still resumes", () => {
      const { questionId: _drop, ...rowWithoutQuestionId } = fullFoundationsRow;
      const result = restoreFromHistory([rowWithoutQuestionId as HistoryRow]);
      expect(result?.stage).toBe("foundations-question");
      expect(result?.foundationsCurrent).toBeUndefined();
    });

    it("resumes into foundations-explain with the explanation text and pending concept index", () => {
      const rows: HistoryRow[] = [
        { text: "A variable stores a value.", tag: "Foundations Explanation", conceptIndex: 2, totalConcepts: 4 },
      ];
      const result = restoreFromHistory(rows);
      expect(result?.stage).toBe("foundations-explain");
      expect(result?.foundationsExplanation).toBe("A variable stores a value.");
      expect(result?.foundationsPendingIndex).toBe(2);
    });

    it("foundations-explain's pending index is also not lost when it's concept 0", () => {
      const rows: HistoryRow[] = [{ text: "explanation", tag: "Foundations Explanation", conceptIndex: 0 }];
      expect(restoreFromHistory(rows)?.foundationsPendingIndex).toBe(0);
    });

    it("resumes into foundations-complete once the gate is cleared", () => {
      const rows: HistoryRow[] = [{ text: "Foundations cleared.", tag: "Foundations Complete", totalConcepts: 4 }];
      const result = restoreFromHistory(rows);
      expect(result?.stage).toBe("foundations-complete");
      expect(result?.foundationsCurrent).toBeUndefined();
      expect(result?.foundationsExplanation).toBeUndefined();
    });
  });
});

describe("mapHistoryRowsToMessages", () => {
  it("maps a plain text row straight through with its citations", () => {
    const rows: HistoryRow[] = [
      { text: "An explanation.", tag: "Grounded Explanation", citations: [{ mark: "[1]", source: "Doc.pdf", excerpt: "..." }] },
    ];
    const [msg] = mapHistoryRowsToMessages(rows);
    expect(msg.paragraphs).toEqual(["An explanation."]);
    expect(msg.citations).toHaveLength(1);
    expect(msg.diagram).toBeUndefined();
  });

  it("a diagram row with citations becomes a 'Sources:' caption, not the raw text, and sets `diagram`", () => {
    const rows: HistoryRow[] = [
      {
        text: "graph TD\nA-->B",
        tag: "Diagram",
        isDiagram: true,
        citations: [{ mark: "[1]", source: "Doc.pdf", excerpt: "..." }],
      },
    ];
    const [msg] = mapHistoryRowsToMessages(rows);
    expect(msg.diagram).toBe("graph TD\nA-->B");
    expect(msg.paragraphs).toEqual(["Sources: [1] Doc.pdf"]);
    expect(msg.citations).toBeUndefined();
  });

  it("a diagram row with no citations has empty paragraphs, not an empty 'Sources:' line", () => {
    const rows: HistoryRow[] = [{ text: "graph TD\nA-->B", tag: "Diagram", isDiagram: true }];
    expect(mapHistoryRowsToMessages(rows)[0].paragraphs).toEqual([]);
  });

  it("converts a Hint row's tag to 'Hint {used}/{max}'", () => {
    const rows: HistoryRow[] = [{ text: "feedback", tag: "Hint", hintsUsed: 2, maxHints: 2 }];
    expect(mapHistoryRowsToMessages(rows)[0].tag).toBe("Hint 2/2");
  });

  it("assigns every message a unique id", () => {
    const rows: HistoryRow[] = [{ text: "a", tag: "Feedback" }, { text: "b", tag: "Feedback" }];
    const [first, second] = mapHistoryRowsToMessages(rows);
    expect(first.id).not.toBe(second.id);
  });
});
