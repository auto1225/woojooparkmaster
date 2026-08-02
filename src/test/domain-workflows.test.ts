import { describe, expect, it } from "vitest";
import { ABANDONED_VEHICLE_WORKFLOW, CAPITAL_PROCEDURE_WORKFLOW, getWorkflowTransitionError, SECURITY_INSPECTION_WORKFLOW } from "@/config/domain-workflows";
import type { TeamWorkRecord } from "@/types/team-work";

const workflows = [ABANDONED_VEHICLE_WORKFLOW, SECURITY_INSPECTION_WORKFLOW, CAPITAL_PROCEDURE_WORKFLOW];

function record(overrides: Partial<TeamWorkRecord> = {}): TeamWorkRecord {
  return { id: "1", recordNumber: "WO-1", recordType: "work_order", team: "operations", title: "검증", category: "검증", parkingLot: "동문", ownerName: "담당자", priority: "normal", status: "registered", dueDate: "2026-08-01", amount: 0, documentNumber: "제주시청-차량관리과운영팀-2026-0142", payload: { completionEvidence: "점검표" }, createdAt: "2026-07-30", updatedAt: "2026-07-30", ...overrides };
}

describe("실제 업무처리 워크플로", () => {
  it("업무별 키, 경로 데이터 및 5단계 처리 흐름이 중복되지 않는다", () => {
    expect(new Set(workflows.map((workflow) => workflow.key)).size).toBe(3);
    for (const workflow of workflows) {
      expect(workflow.stages.map((stage) => stage.status)).toEqual(["registered", "assigned", "in_progress", "review", "completed"]);
      expect(workflow.fields.some((field) => field.key === "completionEvidence")).toBe(true);
      expect(workflow.samples[0].payload?.workflow_key).toBe(workflow.key);
    }
  });

  it("담당자와 기한 없이 배정할 수 없다", () => {
    expect(getWorkflowTransitionError(record({ ownerName: null }), "assigned")).toContain("담당자");
    expect(getWorkflowTransitionError(record({ dueDate: null }), "assigned")).toContain("처리기한");
  });

  it("문서번호 없이 검토할 수 없고 완료 근거 없이 종결할 수 없다", () => {
    expect(getWorkflowTransitionError(record({ documentNumber: null }), "review")).toContain("문서번호");
    expect(getWorkflowTransitionError(record({ payload: { completionEvidence: "" } }), "completed")).toContain("완료 근거");
    expect(getWorkflowTransitionError(record(), "completed")).toBeNull();
  });
});
