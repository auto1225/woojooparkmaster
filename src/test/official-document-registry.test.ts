import { describe, expect, it } from "vitest";
import { DuplicateOfficialDocumentError, normalizeDocumentNumber, requiresOfficialDocumentFile } from "@/lib/official-document-registry";
import type { OfficialDocument } from "@/types/official-document";

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

describe("official document workflow rules", () => {
  it.each(["sent", "received", "archived"] as const)("requires an original file for %s documents", (status) => {
    expect(requiresOfficialDocumentFile(status)).toBe(true);
  });

  it.each(["draft", "registered"] as const)("allows %s metadata before the original is ready", (status) => {
    expect(requiresOfficialDocumentFile(status)).toBe(false);
  });

  it("reports the existing record on a duplicate conflict", () => {
    const document = {
      id: "document-id",
      documentNumber: "제주시청-차량관리과운영팀-2026-0142",
      normalizedNumber: "제주시청차량관리과운영팀20260142",
      title: "공영주차장 운영계획",
      direction: "outgoing",
      documentType: "공문",
      documentDate: "2026-08-03",
      senderOrganization: "제주시청",
      receiverOrganization: null,
      department: "차량관리과 운영팀",
      securityLevel: "일반",
      retentionPeriod: "5년",
      status: "registered",
      notes: null,
      createdAt: "2026-08-03T00:00:00.000Z",
    } satisfies OfficialDocument;
    const error = new DuplicateOfficialDocumentError(document);
    expect(error.document).toBe(document);
    expect(error.message).toContain(document.documentNumber);
  });
});
