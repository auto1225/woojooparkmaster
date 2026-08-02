import { describe, expect, it } from "vitest";
import { formatActivityAction, formatActivityTarget } from "@/lib/activity-format";

describe("activity formatting", () => {
  it("converts workflow codes into Korean labels", () => {
    expect(formatActivityAction("assign")).toBe("담당자 배정");
    expect(formatActivityAction("상태변경→reopened")).toBe("상태 변경 · 재개");
    expect(formatActivityAction("document_update")).toBe("문서 수정");
  });

  it("removes duplicated quotes around record identifiers", () => {
    expect(formatActivityTarget('"CM-20260802-196"')).toBe("CM-20260802-196");
    expect(formatActivityTarget("제주공항입구")).toBe("제주공항입구");
  });
});
