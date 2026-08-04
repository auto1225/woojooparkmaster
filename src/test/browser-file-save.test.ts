import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseBrowserFileDestination, writeBlobToBrowserDestination } from "@/lib/browser-file-save";

const originalPicker = (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;

afterEach(() => {
  if (originalPicker) {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: originalPicker });
  } else {
    delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser file save", () => {
  it("asks for a PDF destination and writes to the selected file", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const picker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: picker });

    const destination = await chooseBrowserFileDestination("운영 현황 보고서.pdf");
    const blob = new Blob(["report"], { type: "application/pdf" });
    const result = await writeBlobToBrowserDestination(blob, "운영 현황 보고서.pdf", destination);

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      id: "parkmaster-reports",
      suggestedName: "운영 현황 보고서.pdf",
      types: [{ description: "PDF 문서", accept: { "application/pdf": [".pdf"] } }],
    }));
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledOnce();
    expect(result).toBe("saved");
  });

  it("treats closing the save dialog as a normal cancellation", async () => {
    const picker = vi.fn().mockRejectedValue({ name: "AbortError", message: "cancelled" });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: picker });

    await expect(chooseBrowserFileDestination("운영 현황 보고서.hwpx")).resolves.toEqual({ kind: "cancelled" });
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      types: [{ description: "한글 HWPX 문서", accept: { "application/zip": [".hwpx"] } }],
    }));
  });

  it("falls back to a browser download when the picker is unavailable", async () => {
    delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });

    const destination = await chooseBrowserFileDestination("운영 현황 보고서.hwpx");
    const result = await writeBlobToBrowserDestination(new Blob(["report"]), "운영 현황 보고서.hwpx", destination);

    expect(destination).toEqual({ kind: "download" });
    expect(click).toHaveBeenCalledOnce();
    expect(result).toBe("downloaded");
  });

  it("falls back to a download when an embedded browser blocks the native picker", async () => {
    const picker = vi.fn().mockRejectedValue({ name: "NotAllowedError" });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: picker });

    await expect(chooseBrowserFileDestination("운영 현황 보고서.pdf")).resolves.toEqual({ kind: "download" });
  });
});
