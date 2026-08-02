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
  const websiteMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[\w./-]*)?/i);
  if (websiteMatch && websiteMatch[0].toLowerCase() !== result.email.split("@")[1]) result.website = websiteMatch[0];

  const phonePattern = /(?:\+?82[-\s]?)?0?\d{1,2}[-\s.)]+\d{3,4}[-\s]+\d{4}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g;
  lines.forEach((line) => {
    const matches = line.match(phonePattern) || [];
    matches.forEach((match) => {
      const normalized = normalizePhone(match);
      if (/fax|팩스/i.test(line)) result.fax ||= normalized;
      else if (/mobile|cell|휴대|h\.?p/i.test(line) || /^01[016789]/.test(normalized)) result.mobile ||= normalized;
      else result.phone ||= normalized;
    });
  });

  const positionLine = lines.find((line) => POSITION_WORDS.some((word) => line.toLocaleLowerCase("ko-KR").includes(word)));
  if (positionLine) {
    const position = POSITION_WORDS.find((word) => positionLine.toLocaleLowerCase("ko-KR").includes(word));
    result.position = position || positionLine;
  }
  result.company = lines.find((line) => COMPANY_WORDS.some((word) => line.toLocaleLowerCase("ko-KR").includes(word))) || "";
  result.department = lines.find((line) => line !== result.company && DEPARTMENT_WORDS.some((word) => line.includes(word)) && !/@|www\.|https?:|\d{2,}/i.test(line)) || "";
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

export function businessCardCompleteness(fields: BusinessCardFields) {
  const keys: Array<keyof BusinessCardFields> = ["name", "company", "position", "mobile", "phone", "email", "address"];
  return Math.round((keys.filter((key) => Boolean(fields[key])).length / keys.length) * 100);
}
