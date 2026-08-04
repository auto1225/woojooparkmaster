import { describe, expect, it, vi } from "vitest";
import { mergeFacilityPhotoFiles } from "@/components/facility/FacilityPhotoPicker";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function photo(name: string, type = "image/jpeg", size = 128) {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1 });
}

describe("facility photo selection", () => {
  it("accepts facility photos without making them mandatory", () => {
    expect(mergeFacilityPhotoFiles([], [])).toEqual([]);
    expect(mergeFacilityPhotoFiles([], [photo("equipment.jpg")])).toHaveLength(1);
  });

  it("deduplicates photos and caps one registration at ten files", () => {
    const files = Array.from({ length: 12 }, (_, index) => photo(`field-${index}.jpg`));
    expect(mergeFacilityPhotoFiles([files[0]], files)).toHaveLength(10);
  });

  it("rejects unsupported image formats", () => {
    expect(mergeFacilityPhotoFiles([], [photo("drawing.svg", "image/svg+xml")])).toEqual([]);
  });
});
