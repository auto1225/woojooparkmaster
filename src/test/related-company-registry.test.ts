import { describe, expect, it } from "vitest";
import { matchesRelatedCompanyContact, type RelatedCompanyContact } from "@/lib/related-company-registry";

const contact: RelatedCompanyContact = {
  module: "FACILITY_EQUIPMENT",
  recordId: "record-1",
  recordLabel: "동문시장 차단기",
  recordPath: "/facility/equipment?equipment=record-1",
  companyName: "제주주차설비",
  managerName: "김현장",
  phone: "064-700-1234",
  email: "field@example.com",
};

describe("related company search", () => {
  it.each(["제주주차", "김현장", "700-1234", "field@", "동문시장"])("finds %s", (query) => {
    expect(matchesRelatedCompanyContact(contact, query)).toBe(true);
  });

  it("rejects unrelated text", () => {
    expect(matchesRelatedCompanyContact(contact, "용담해안")).toBe(false);
  });
});
