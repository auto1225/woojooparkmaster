import { describe, expect, it } from "vitest";
import { businessCardCompleteness, inferBusinessCardProfile, normalizePhone, parseBusinessCardText } from "@/lib/business-card-ocr";

describe("business card OCR parser", () => {
  it("organizes Korean business card text", () => {
    const parsed = parseBusinessCardText(`주식회사 제주스마트주차\n시설사업팀 팀장\n김현수\nMobile 010-2345-6789\nTel 064-728-3901\nFax 064-728-3902\nkim@jejuparking.co.kr\n제주특별자치도 제주시 중앙로 1`);
    expect(parsed.name).toBe("김현수");
    expect(parsed.company).toBe("주식회사 제주스마트주차");
    expect(parsed.position).toBe("팀장");
    expect(parsed.mobile).toBe("010-2345-6789");
    expect(parsed.phone).toBe("064-728-3901");
    expect(parsed.fax).toBe("064-728-3902");
    expect(parsed.email).toBe("kim@jejuparking.co.kr");
    expect(parsed.address).toContain("제주특별자치도");
  });

  it("normalizes common phone formats", () => {
    expect(normalizePhone("010 1234 5678")).toBe("010-1234-5678");
    expect(normalizePhone("+82 10 1234 5678")).toBe("010-1234-5678");
  });

  it("calculates extraction completeness", () => {
    expect(businessCardCompleteness({ ...parseBusinessCardText("김현수\n010-1234-5678"), company: "제주주차" })).toBeGreaterThan(25);
  });

  it("separates office and fax numbers written on one line", () => {
    const parsed = parseBusinessCardText("김민수\n시설사업팀 팀장\nTel 064-728-3950 Fax 064-728-3951");
    expect(parsed.department).toBe("시설사업팀");
    expect(parsed.position).toBe("팀장");
    expect(parsed.phone).toBe("064-728-3950");
    expect(parsed.fax).toBe("064-728-3951");
  });

  it("infers facility work and parking lot scopes", () => {
    const profile = inferBusinessCardProfile("노외·주차빌딩·노상 시설 유지관리 및 전기 소방 점검");
    expect(profile.businessCategory).toBe("facility");
    expect(profile.lotTypes).toEqual(["offstreet", "multilevel", "onstreet"]);
    expect(profile.tags).toContain("시설관리");
  });
});
