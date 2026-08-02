import { describe, expect, it } from "vitest";
import {
  buildParkingLocationDetail,
  createChecklistForLotType,
  getComplaintRule,
  getMissingRequiredEquipment,
  getParkingLotWorkProfile,
  getRecommendedDueDate,
} from "@/lib/parking-lot-work-profile";

describe("parking lot work profiles", () => {
  it("uses a distinct checklist for each primary parking type", () => {
    const offstreet = createChecklistForLotType("offstreet").map((item) => item.item);
    const multilevel = createChecklistForLotType("multilevel").map((item) => item.item);
    const onstreet = createChecklistForLotType("onstreet").map((item) => item.item);

    expect(offstreet).toContain("포장 균열·파임·침하");
    expect(multilevel).toContain("화재감지·경보 설비");
    expect(onstreet).toContain("주차면 센서 작동");
    expect(new Set([offstreet.join("|"), multilevel.join("|"), onstreet.join("|")]).size).toBe(3);
  });

  it("recommends routing, urgency and linked work from the subtype", () => {
    const rule = getComplaintRule("multilevel", "fire_safety");
    expect(rule).toMatchObject({ assignedTeam: "facilities", priority: "urgent", dueDays: 1, createsMaintenanceWork: true });
  });

  it("builds a searchable structured location without a schema change", () => {
    expect(buildParkingLocationDetail("onstreet", { primary: "중앙로 북측", secondary: "동→서 우측", space: "N-024" }))
      .toBe("도로명·구간: 중앙로 북측 / 진행방향·도로측: 동→서 우측 / 주차면 번호: N-024");
  });

  it("identifies missing operating-standard equipment", () => {
    expect(getMissingRequiredEquipment("offstreet", ["cctv", "lighting"]))
      .toEqual(["barrier", "kiosk"]);
  });

  it("retains dedicated profiles for underground and vacant lots", () => {
    expect(getParkingLotWorkProfile("underground").label).toBe("지하주차장");
    expect(getParkingLotWorkProfile("vacant_lot").label).toBe("공한지주차장");
  });

  it("calculates the recommended due date from the selected rule", () => {
    expect(getRecommendedDueDate(3, new Date("2026-08-02T00:00:00"))).toBe("2026-08-05");
  });
});
