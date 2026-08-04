import { describe, expect, it, vi } from "vitest";
import {
  buildFacilityPhotoRelativePath,
  chooseFacilityPhotoDirectory,
  getLocalFacilityPhotoFile,
  listLocalFacilityPhotos,
  sanitizeLocalPhotoName,
  saveFacilityRecordPhotosLocally,
} from "@/lib/facility-local-photos";

describe("facility local photo paths", () => {
  it("groups photos by facility work type, year, month, and record", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("12345678-1234-4234-8234-123456789012");
    expect(buildFacilityPhotoRelativePath(
      "equipment",
      "equipment-001",
      "차단기 명판.jpg",
      new Date(2026, 7, 4, 9, 5, 7),
    )).toEqual([
      "시설관리",
      "장비",
      "2026",
      "08",
      "equipment-001",
      "20260804_090507_12345678_차단기_명판.jpg",
    ]);
    vi.restoreAllMocks();
  });

  it("removes characters that Windows does not allow in file names", () => {
    expect(sanitizeLocalPhotoName('입구<전경>:A/01?.png')).toBe("입구_전경__A_01_.png");
  });

  it("writes the binary photo to the selected PC directory and keeps a local record index", async () => {
    const writes: Blob[] = [];
    const storedFiles = new Map<string, File>();
    const directory = (name: string): any => ({
      name,
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn(async (childName: string) => directory(childName)),
      getFileHandle: vi.fn(async (fileName: string) => ({
        createWritable: async () => ({
          write: async (blob: Blob) => {
            writes.push(blob);
            storedFiles.set(fileName, new File([blob], fileName, { type: blob.type }));
          },
          close: async () => undefined,
        }),
        getFile: async () => storedFiles.get(fileName) || new File([], fileName),
      })),
    });
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: vi.fn(async () => directory("현장사진")) });

    await chooseFacilityPhotoDirectory();
    const file = new File(["binary-photo"], "차단기.jpg", { type: "image/jpeg" });
    const result = await saveFacilityRecordPhotosLocally("equipment", "equipment-local-test", [file]);
    const indexed = await listLocalFacilityPhotos("equipment", "equipment-local-test");

    expect(result.saveErrors).toEqual([]);
    expect(result.savedPaths[0]).toContain("시설관리/장비/");
    expect(writes).toHaveLength(1);
    expect(indexed).toHaveLength(1);
    expect((await getLocalFacilityPhotoFile(indexed[0])).size).toBeGreaterThan(0);
  });
});
