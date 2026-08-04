import { describe, expect, it } from "vitest";
import {
  type TeamDutyInput,
  validateTeamDutyInput,
} from "@/lib/team-duty-registry";

function dutyInput(overrides: Partial<TeamDutyInput> = {}): TeamDutyInput {
  return {
    team: "operations",
    area: "노상주차장 현장 대응",
    role: "운영팀 주무관",
    phone: "064-728-3822",
    duties: ["노면표시 훼손 확인", "민원 후속 조치"],
    recordType: "compliance",
    category: "노상안전점검",
    destination: "/facility/safety",
    destinationLabel: "안전점검",
    primaryAssigneeId: "11111111-1111-4111-8111-111111111111",
    primaryAssigneeName: "담당자",
    deputyAssigneeId: null,
    deputyAssigneeName: null,
    effectiveFrom: "2026-08-03",
    effectiveTo: null,
    lotTypes: ["onstreet"],
    documentId: null,
    documentNumber: "제주시청-차량관리과운영팀-2026-0803-01",
    assignmentStatus: "active",
    handoverDueDate: null,
    handoverNote: null,
    changeReason: null,
    ...overrides,
  };
}

describe("team duty assignment registry", () => {
  it("accepts an accountable, type-scoped assignment", () => {
    expect(() => validateTeamDutyInput(dutyInput())).not.toThrow();
  });

  it("requires a real assignee and at least one supported parking-lot type", () => {
    expect(() =>
      validateTeamDutyInput(dutyInput({ primaryAssigneeId: null })),
    ).toThrow("실제 담당자");
    expect(() => validateTeamDutyInput(dutyInput({ lotTypes: [] }))).toThrow(
      "주차장 형태",
    );
  });

  it("rejects invalid dates, phone numbers, and self handover", () => {
    expect(() =>
      validateTeamDutyInput(dutyInput({ effectiveTo: "2026-08-02" })),
    ).toThrow("종료일");
    expect(() =>
      validateTeamDutyInput(dutyInput({ phone: "0647283822" })),
    ).toThrow("전화번호");
    expect(() =>
      validateTeamDutyInput(
        dutyInput({
          deputyAssigneeId: "11111111-1111-4111-8111-111111111111",
        }),
      ),
    ).toThrow("서로 달라야");
  });

  it("requires complete handover evidence", () => {
    expect(() =>
      validateTeamDutyInput(
        dutyInput({ assignmentStatus: "handover_pending" }),
      ),
    ).toThrow("인수인계");
    expect(() =>
      validateTeamDutyInput(
        dutyInput({
          assignmentStatus: "handover_pending",
          deputyAssigneeId: "22222222-2222-4222-8222-222222222222",
          handoverDueDate: "2026-08-10",
          handoverNote: "미결 민원과 현장 사진을 전달",
        }),
      ),
    ).not.toThrow();
  });
});
