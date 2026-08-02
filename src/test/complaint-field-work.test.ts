import { describe, expect, it } from "vitest";
import {
  formatFieldVisitComment,
  getComplaintFieldChecklist,
  getComplaintNextAction,
  isFieldVerificationRequired,
  validateComplaintClosure,
  validateComplaintResponse,
} from "@/lib/complaint-field-work";

describe("complaint field work", () => {
  it.each([
    ["offstreet", "포장·배수 상태"],
    ["multilevel", "층·구역·기둥번호 확인"],
    ["onstreet", "도로명·구간·진행방향 확인"],
  ])("creates a type-specific checklist for %s", (lotType, expected) => {
    const checklist = getComplaintFieldChecklist(lotType, null);
    expect(checklist.some((item) => item.label === expected)).toBe(true);
    expect(checklist.filter((item) => item.required)).toHaveLength(3);
  });

  it("requires a field visit or an explicit exception before response", () => {
    expect(validateComplaintResponse({
      response: "현장 조치 결과를 안내드립니다.",
      responseType: "resolved",
      fieldRequired: true,
      fieldVisitCount: 0,
    })).toContain("현장 확인을 등록하거나 미실시 사유를 입력하세요.");

    expect(validateComplaintResponse({
      response: "관제 기록으로 확인하여 결과를 안내드립니다.",
      responseType: "information",
      fieldRequired: true,
      fieldVisitCount: 0,
      noVisitReason: "당일 시설점검 기록과 CCTV 관제 기록으로 대체 확인",
    })).toEqual([]);
  });

  it("requires a documented and confirmed closure", () => {
    expect(validateComplaintClosure("resolved", "짧음", false)).toHaveLength(2);
    expect(validateComplaintClosure("resolved", "현장 조치와 민원인 회신을 모두 확인했습니다.", true)).toEqual([]);
  });

  it("marks facility, safety and maintenance-linked subtypes as field work", () => {
    expect(isFieldVerificationRequired("facility", "offstreet", "gate_kiosk")).toBe(true);
    expect(isFieldVerificationRequired("operation", "onstreet", "access_obstruction")).toBe(false);
  });

  it("surfaces the next operational action", () => {
    expect(getComplaintNextAction("assigned", true, 0, false)).toContain("현장 확인");
    expect(getComplaintNextAction("pending_external", false, 0, false)).toContain("회신 예정일");
    expect(getComplaintNextAction("responded", false, 0, true)).toContain("완결");
  });

  it("formats a readable field audit record", () => {
    const content = formatFieldVisitComment({
      complaintId: "complaint-1",
      complaintNumber: "CM-20260802-001",
      authorId: "user-1",
      authorName: "시설관리 주무관",
      lotType: "multilevel",
      subCategory: "fire_safety",
      status: "assigned",
      visitedAt: "2026-08-02T10:30",
      outcome: "immediate_action",
      observation: "3층 소화기 봉인 훼손을 확인했습니다.",
      actionTaken: "예비 소화기로 교체하고 업체 점검을 요청했습니다.",
      checkedItemIds: [],
    }, ["층·구역·기둥번호 확인"]);
    expect(content).toContain("주차장 형태: 주차빌딩");
    expect(content).toContain("확인결과: 현장 즉시 조치");
    expect(content).toContain("층·구역·기둥번호 확인");
  });
});
