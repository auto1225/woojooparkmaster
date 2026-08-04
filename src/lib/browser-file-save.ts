export type BrowserFileSaveResult = "saved" | "downloaded" | "cancelled";

interface WritableFileStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableFileStreamLike>;
}

interface SaveFilePickerOptionsLike {
  id?: string;
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<FileHandleLike>;
};

export type BrowserFileSaveDestination =
  | { kind: "file-handle"; handle: FileHandleLike }
  | { kind: "download" }
  | { kind: "cancelled" };

function filePickerTypes(fileName: string): SaveFilePickerOptionsLike["types"] {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return [{ description: "PDF 문서", accept: { "application/pdf": [".pdf"] } }];
  if (extension === "hwpx") return [{ description: "한글 HWPX 문서", accept: { "application/zip": [".hwpx"] } }];
  if (extension === "xlsx") {
    return [{
      description: "엑셀 통합 문서",
      accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    }];
  }
  return [{ description: "보고서 파일", accept: { "application/octet-stream": extension ? [`.${extension}`] : [] } }];
}

function isCancelledPicker(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function isBlockedPicker(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return error.name === "NotAllowedError" || error.name === "SecurityError";
}

/**
 * Must be called directly from the user's click handler, before any network await,
 * so Chromium keeps the transient user activation required by the native picker.
 */
export async function chooseBrowserFileDestination(fileName: string): Promise<BrowserFileSaveDestination> {
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (!picker) return { kind: "download" };

  try {
    const handle = await picker.call(window, {
      id: "parkmaster-reports",
      suggestedName: fileName,
      types: filePickerTypes(fileName),
      excludeAcceptAllOption: false,
    });
    return { kind: "file-handle", handle };
  } catch (error) {
    if (isCancelledPicker(error)) return { kind: "cancelled" };
    if (isBlockedPicker(error)) return { kind: "download" };
    const saveError = new Error("저장 위치 선택 창을 열 수 없습니다. 브라우저의 파일 저장 권한을 확인한 뒤 다시 시도해 주세요.");
    (saveError as Error & { cause?: unknown }).cause = error;
    throw saveError;
  }
}

export async function writeBlobToBrowserDestination(
  blob: Blob,
  fileName: string,
  destination: BrowserFileSaveDestination,
): Promise<BrowserFileSaveResult> {
  if (destination.kind === "cancelled") return "cancelled";

  if (destination.kind === "file-handle") {
    const writable = await destination.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return "downloaded";
}
