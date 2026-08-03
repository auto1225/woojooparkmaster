import { describe, expect, it } from "vitest";
import {
  matchesBusinessCard,
  normalizeBusinessCardCompany,
  suggestBusinessCardLinks,
  validateBusinessCardInput,
  type BusinessCard,
  type BusinessCardInput,
  type BusinessCardLinkOption,
} from "@/lib/business-card-registry";

function input(overrides: Partial<BusinessCardInput> = {}): BusinessCardInput {
  return {
    id: "", rowVersion: 1, name: "김민수", company: "주식회사 제주스마트시설", department: "시설사업팀", position: "팀장",
    mobile: "010-2468-1357", phone: "064-728-3950", fax: "064-728-3951", email: "minsu@example.test",
    website: "", address: "제주시 중앙로 25", rawText: "", memo: "", tags: ["시설관리"], imagePath: "", imageName: "",
    businessCategory: "facility", lotTypes: ["offstreet", "multilevel", "onstreet"], preferredChannel: "mobile",
    emergencyContact: false, collectionSource: "business_card", businessPurpose: "공영주차장 시설 유지보수 연락",
    lastVerifiedAt: "2026-08-03", retentionReviewDate: null, ocrCompleteness: 100, retainOcrText: false, links: [],
    ...overrides,
  };
}

describe("business card registry", () => {
  it("validates a scoped operational contact", () => {
    expect(() => validateBusinessCardInput(input())).not.toThrow();
    expect(() => validateBusinessCardInput(input({ mobile: "", phone: "", email: "" }))).toThrow("하나를 입력");
    expect(() => validateBusinessCardInput(input({ lotTypes: [] }))).toThrow("주차장 형태");
  });

  it("rejects malformed contact information", () => {
    expect(() => validateBusinessCardInput(input({ mobile: "123" }))).toThrow("휴대전화 형식");
    expect(() => validateBusinessCardInput(input({ email: "invalid" }))).toThrow("이메일 형식");
  });

  it("normalizes company names and suggests matching work records", () => {
    expect(normalizeBusinessCardCompany("(주) 제주-스마트시설")).toBe("제주스마트시설");
    const option: BusinessCardLinkOption = {
      id: "link", key: "FACILITY_EQUIPMENT:equipment", module: "FACILITY_EQUIPMENT", recordId: "equipment",
      recordLabel: "CCTV 1호", recordPath: "/facility/equipment?equipment=equipment", companyName: "제주스마트시설",
      relationType: "company_contact", lotId: null, managerName: "", phone: "", email: "",
    };
    expect(suggestBusinessCardLinks(input(), [option])).toEqual([option]);
  });

  it("searches email, linked records, and parking contact fields", () => {
    const card = {
      ...input(), cardNumber: "BC-20260803-000001", owningTeam: "제주시청 차량관리과 운영팀", archivedAt: null,
      archiveReason: null, createdAt: "2026-08-03", updatedAt: "2026-08-03",
      links: [{ module: "FACILITY_EQUIPMENT", recordId: "equipment", recordLabel: "CCTV 1호", recordPath: "/facility/equipment", companyName: "제주스마트시설", relationType: "company_contact", lotId: null }],
    } as BusinessCard;
    expect(matchesBusinessCard(card, "minsu@example.test")).toBe(true);
    expect(matchesBusinessCard(card, "CCTV 1호")).toBe(true);
  });
});
