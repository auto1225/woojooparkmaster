import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHancomPdfConverter, convertHwpxToPdfWithHancom } from "@/lib/hancom-pdf-converter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hancom PDF converter", () => {
  it("reports the local Hancom bridge status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(checkHancomPdfConverter()).resolves.toBe(true);
  });

  it("accepts only a signed PDF returned by the Hancom engine", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\n/Type /Page\n%%EOF");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(pdfBytes, {
      status: 200,
      headers: { "Content-Type": "application/pdf", "X-PDF-Page-Count": "3" },
    })));
    const result = await convertHwpxToPdfWithHancom(new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: "application/hwp+zip" }));
    expect(result.blob.type).toBe("application/pdf");
    expect(result.pageCount).toBe(3);
  });

  it("does not silently substitute a separately rendered PDF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(convertHwpxToPdfWithHancom(new Blob())).rejects.toThrow("한컴 PDF 변환 서비스를 연결하지 못했습니다");
  });
});
