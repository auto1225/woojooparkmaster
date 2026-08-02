import { describe, expect, it } from "vitest";
import { normalizeDocumentNumber } from "@/lib/official-document-registry";

describe("official document number normalization", () => {
  it("matches punctuation and spacing variants", () => {
    expect(normalizeDocumentNumber("제주시청-차량관리과운영팀-2026-0142"))
      .toBe(normalizeDocumentNumber("제주시청 차량관리과 운영팀 2026 / 0142"));
  });

  it("normalizes full-width and lowercase characters", () => {
    expect(normalizeDocumentNumber(" ａｂｃ-2026-01 ")).toBe("ABC202601");
  });

  it("keeps Korean letters and digits used by public documents", () => {
    expect(normalizeDocumentNumber("차량관리과운영팀-제142호")).toBe("차량관리과운영팀제142호");
  });
});
