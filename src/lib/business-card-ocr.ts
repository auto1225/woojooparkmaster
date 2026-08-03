export interface BusinessCardFields {
  name: string;
  company: string;
  department: string;
  position: string;
  mobile: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  address: string;
  rawText: string;
}

export type InferredBusinessCategory = "facility" | "service" | "operations" | "procurement" | "complaint" | "public" | "other";
export type InferredLotType = "offstreet" | "multilevel" | "onstreet";

export interface BusinessCardProfile {
  businessCategory: InferredBusinessCategory;
  lotTypes: InferredLotType[];
  tags: string[];
}

const POSITION_WORDS = [
  "대표이사", "대표", "본부장", "센터장", "실장", "부장", "차장", "과장", "팀장",
  "대리", "주임", "사원", "책임", "선임", "주무관", "director", "manager", "ceo",
];
const COMPANY_WORDS = ["주식회사", "(주)", "㈜", "회사", "공사", "공단", "연구원", "시스템", "테크", "tech", "co.", "ltd"];
const DEPARTMENT_WORDS = ["팀", "과", "부", "실", "본부", "센터", "사업소"];

const emptyFields = (rawText = ""): BusinessCardFields => ({
  name: "", company: "", department: "", position: "", mobile: "", phone: "", fax: "",
  email: "", website: "", address: "", rawText,
});

export function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.startsWith("82") && digits.length >= 11) return normalizePhone(`0${digits.slice(2)}`);
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return value.trim().replace(/\s+/g, "-");
}

export function parseBusinessCardText(rawText: string): BusinessCardFields {
  const result = emptyFields(rawText.trim());
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const lowerLines = lines.map((line) => line.toLocaleLowerCase("ko-KR"));

  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  result.email = emailMatch?.[0].toLowerCase() || "";
  const websiteMatch = lines
    .filter((line) => !line.includes("@"))
    .map((line) => line.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[\w./-]*)?/i)?.[0])
    .find(Boolean);
  result.website = websiteMatch || "";

  const phonePattern = /(?:\+?82[-\s]?)?0?\d{1,2}[-\s.)]+\d{3,4}[-\s]+\d{4}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g;
  lines.forEach((line) => {
    const matches = [...line.matchAll(phonePattern)];
    matches.forEach((match, index) => {
      const normalized = normalizePhone(match[0]);
      const previousEnd = index > 0 ? (matches[index - 1].index || 0) + matches[index - 1][0].length : 0;
      const label = line.slice(previousEnd, match.index).toLocaleLowerCase("ko-KR");
      if (/fax|팩스|f\.?\s*$/.test(label)) result.fax ||= normalized;
      else if (/mobile|cell|휴대|h\.?p|m\.?\s*$/.test(label) || /^01[016789]/.test(normalized)) result.mobile ||= normalized;
      else result.phone ||= normalized;
    });
  });

  const positionLine = lines.find((line) => POSITION_WORDS.some((word) => line.toLocaleLowerCase("ko-KR").includes(word)));
  if (positionLine) {
    const position = POSITION_WORDS.find((word) => positionLine.toLocaleLowerCase("ko-KR").includes(word));
    result.position = position || positionLine;
  }
  result.company = lines.find((line) => COMPANY_WORDS.some((word) => line.toLocaleLowerCase("ko-KR").includes(word))) || "";
  const departmentLine = lines.find((line) => line !== result.company && DEPARTMENT_WORDS.some((word) => line.includes(word)) && !/@|www\.|https?:|\d{2,}/i.test(line)) || "";
  result.department = POSITION_WORDS.reduce((value, word) => value.replace(new RegExp(`\\s*${word}\\s*`, "i"), " "), departmentLine).trim();
  result.address = lines.find((line) => /(?:특별자치도|광역시|특별시|[가-힣]+[도시군구])\s.*(?:로|길|동|읍|면)\s*\d*/.test(line) || /(?:주소|address)\s*[:：]/i.test(line))?.replace(/^(?:주소|address)\s*[:：]\s*/i, "") || "";

  const ignored = new Set([result.company, result.department, positionLine || "", result.address]);
  const koreanName = lines.find((line) => !ignored.has(line) && /^[가-힣]{2,4}(?:\s+[가-힣]{2,4})?$/.test(line));
  const lineBeforePosition = positionLine ? lines[lines.indexOf(positionLine) - 1] : "";
  if (lineBeforePosition && /^[가-힣]{2,4}(?:\s+[가-힣]{2,4})?$/.test(lineBeforePosition)) result.name = lineBeforePosition;
  else result.name = koreanName || "";

  if (!result.name) {
    result.name = lines.find((line, index) => {
      if (ignored.has(line) || index > 5 || /@|www\.|https?:|\d/.test(line)) return false;
      return /^[A-Za-z][A-Za-z .'-]{2,30}$/.test(line) && !COMPANY_WORDS.some((word) => lowerLines[index].includes(word));
    }) || "";
  }
  return result;
}

export function inferBusinessCardProfile(rawText: string): BusinessCardProfile {
  const text = rawText.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const lotTypes: InferredLotType[] = [];
  if (/노외/.test(text)) lotTypes.push("offstreet");
  if (/주차\s*빌딩|주차\s*건물|입체\s*주차/.test(text)) lotTypes.push("multilevel");
  if (/노상/.test(text)) lotTypes.push("onstreet");

  const rules: Array<{ category: InferredBusinessCategory; pattern: RegExp; tag: string }> = [
    { category: "facility", pattern: /시설|유지\s*보수|관제|전기|소방|승강기|건축|통신|정비/, tag: "시설관리" },
    { category: "service", pattern: /용역|청소|경비|위탁|계약/, tag: "용역" },
    { category: "procurement", pattern: /납품|구매|조달|입찰|물품/, tag: "조달" },
    { category: "operations", pattern: /운영|정산|수입|주차\s*요금/, tag: "운영" },
    { category: "public", pattern: /시청|도청|공단|공사|공공기관|주무관/, tag: "공공기관" },
  ];
  const matched = rules.find((rule) => rule.pattern.test(text));
  const tags = rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.tag);
  if (lotTypes.includes("offstreet")) tags.push("노외주차장");
  if (lotTypes.includes("multilevel")) tags.push("주차빌딩");
  if (lotTypes.includes("onstreet")) tags.push("노상주차장");
  return {
    businessCategory: matched?.category || "other",
    lotTypes: lotTypes.length ? lotTypes : ["offstreet", "multilevel", "onstreet"],
    tags: [...new Set(tags)],
  };
}

export function businessCardCompleteness(fields: BusinessCardFields) {
  const keys: Array<keyof BusinessCardFields> = ["name", "company", "position", "mobile", "phone", "email", "address"];
  return Math.round((keys.filter((key) => Boolean(fields[key])).length / keys.length) * 100);
}
