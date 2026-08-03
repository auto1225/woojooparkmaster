import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Building2, CalendarClock, ClipboardList, ContactRound, FileText, Gavel, MessageSquare, Wrench } from "lucide-react";
import { CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { supabase } from "@/integrations/supabase/client";
import { isModuleEnabled } from "@/lib/authorization";
import { listOfficialDocuments } from "@/lib/official-document-registry";
import { listTeamWorkRecords } from "@/lib/team-work-registry";
import { listRelatedCompanyContacts, matchesRelatedCompanyContact } from "@/lib/related-company-registry";
import { listBusinessCards, matchesBusinessCard } from "@/lib/business-card-registry";

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  path: string;
  category: string;
}

const ICONS: Record<string, typeof FileText> = {
  "팀 업무": ClipboardList,
  문서: FileText,
  주차장: Building2,
  민원: MessageSquare,
  입찰: Gavel,
  용역: Briefcase,
  "시설 장비": Wrench,
  유지보수: Wrench,
  "점검 일정": CalendarClock,
  "업체 연락망": Briefcase,
  명함: ContactRound,
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchSequenceRef = useRef(0);
  const isModuleActive = useCallback((code: string) => isModuleEnabled(licenses, code), [licenses]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("parkmaster-recent-searches");
      if (stored) setRecent(JSON.parse(stored));
    } catch {
      setRecent([]);
    }
  }, []);

  const search = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      searchSequenceRef.current += 1;
      setResults([]);
      setSearching(false);
      setPartialFailure(false);
      return;
    }
    const requestId = ++searchSequenceRef.current;
    const cleaned = value.trim().replace(/[,%()]/g, " ");
    const term = `%${cleaned}%`;
    const lowered = cleaned.toLocaleLowerCase("ko-KR");
    setSearching(true);
    setPartialFailure(false);

    const tasks: Array<Promise<SearchResult[]>> = [
      listOfficialDocuments(cleaned).then((documents) => documents.slice(0, 8).map((document) => ({
        id: document.id, label: document.documentNumber, sub: document.title, path: `/documents/${document.id}`, category: "문서",
      }))),
      listTeamWorkRecords().then((records) => records
        .filter((record) => `${record.recordNumber} ${record.title} ${record.ownerName || ""} ${record.documentNumber || ""}`.toLocaleLowerCase("ko-KR").includes(lowered))
        .slice(0, 8)
        .map((record) => ({ id: record.id, label: record.recordNumber, sub: `${record.title} · ${record.ownerName || "담당 미지정"}`, path: `/team-work?tab=${record.recordType}&work=${record.id}`, category: "팀 업무" }))),
      listBusinessCards().then((cards) => cards.filter((card) => matchesBusinessCard(card, cleaned)).slice(0, 10).map((card) => ({
        id: card.id, label: card.name || card.company, sub: `${card.company || "회사 미등록"}${card.position ? ` · ${card.position}` : ""}${card.mobile || card.phone ? ` · ${card.mobile || card.phone}` : ""}${card.email ? ` · ${card.email}` : ""}`, path: `/business-cards?card=${card.id}`, category: "명함",
      }))),
      supabase.from("parking_lots").select("id, name, code, address_jibun").or(`name.ilike.${term},code.ilike.${term},address_jibun.ilike.${term}`).limit(6)
        .then(({ data, error }) => { if (error) throw error; return (data || []).map((lot) => ({ id: lot.id, label: `${lot.name} (${lot.code})`, sub: lot.address_jibun || "", path: `/lots/${lot.id}`, category: "주차장" })); }),
    ];

    if (isModuleActive("FACILITY")) {
      tasks.push(
        supabase.from("equipment").select("id, equipment_code, name, manufacturer, model, parking_lots(name)")
          .or(`equipment_code.ilike.${term},name.ilike.${term},manufacturer.ilike.${term},model.ilike.${term}`).limit(8)
          .then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: `${item.equipment_code} ${item.name}`, sub: `${item.parking_lots?.name || "주차장 미지정"} · ${item.manufacturer || "제조사 미등록"}`, path: `/facility/equipment?equipment=${item.id}`, category: "시설 장비" })); }),
        supabase.from("maintenance_logs").select("id, log_number, title, vendor_name, vendor_contact, parking_lots(name)")
          .or(`log_number.ilike.${term},title.ilike.${term},vendor_name.ilike.${term},vendor_contact.ilike.${term}`).limit(8)
          .then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: `${item.log_number} ${item.title}`, sub: `${item.parking_lots?.name || "주차장 미지정"} · ${item.vendor_name || "업체 미등록"}${item.vendor_contact ? ` · ${item.vendor_contact}` : ""}`, path: `/facility/maintenance?work=${item.id}`, category: "유지보수" })); }),
        supabase.from("maintenance_schedules").select("id, schedule_name, vendor_name, parking_lots(name)")
          .or(`schedule_name.ilike.${term},vendor_name.ilike.${term}`).limit(8)
          .then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: item.schedule_name, sub: `${item.parking_lots?.name || "주차장 미지정"} · ${item.vendor_name || "업체 미등록"}`, path: `/facility/schedule?schedule=${item.id}`, category: "점검 일정" })); }),
        listRelatedCompanyContacts().then((contacts) => contacts.filter((contact) => matchesRelatedCompanyContact(contact, cleaned)).slice(0, 12).map((contact) => ({ id: contact.id || `${contact.module}-${contact.recordId}`, label: contact.companyName || contact.recordLabel, sub: `${contact.recordLabel}${contact.managerName ? ` · ${contact.managerName}` : ""}${contact.phone ? ` · ${contact.phone}` : ""}${contact.email ? ` · ${contact.email}` : ""}`, path: contact.recordPath, category: "업체 연락망" }))),
      );
    }
    if (isModuleActive("COMPLAINT")) tasks.push(supabase.from("complaints").select("id, complaint_number, title").or(`complaint_number.ilike.${term},title.ilike.${term}`).limit(6).then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: item.complaint_number, sub: item.title, path: `/complaints/${item.id}`, category: "민원" })); }));
    if (isModuleActive("PROCUREMENT")) tasks.push(supabase.from("bid_projects").select("id, bid_number, title").or(`bid_number.ilike.${term},title.ilike.${term}`).limit(6).then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: item.bid_number, sub: item.title, path: `/procurement/projects/${item.id}`, category: "입찰" })); }));
    if (isModuleActive("SERVICE")) tasks.push(supabase.from("service_projects").select("id, project_number, title, contractor_name, contractor_manager, contractor_phone, contractor_manager_phone, contractor_email")
      .or(`project_number.ilike.${term},title.ilike.${term},contractor_name.ilike.${term},contractor_manager.ilike.${term},contractor_phone.ilike.${term},contractor_manager_phone.ilike.${term},contractor_email.ilike.${term}`).limit(8)
      .then(({ data, error }) => { if (error) throw error; return (data || []).map((item) => ({ id: item.id, label: item.project_number, sub: `${item.title} · ${item.contractor_name}${item.contractor_manager ? ` · ${item.contractor_manager}` : ""}${item.contractor_manager_phone || item.contractor_phone ? ` · ${item.contractor_manager_phone || item.contractor_phone}` : ""}`, path: `/service/projects/${item.id}`, category: "용역" })); }));

    const settled = await Promise.allSettled(tasks);
    if (requestId !== searchSequenceRef.current) return;
    setResults(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    setPartialFailure(settled.some((result) => result.status === "rejected"));
    setSearching(false);
  }, [isModuleActive]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const selectResult = (result: SearchResult) => {
    const updated = [result.label, ...recent.filter((item) => item !== result.label)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem("parkmaster-recent-searches", JSON.stringify(updated));
    setOpen(false);
    setQuery("");
    navigate(result.path);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((accumulator, result) => {
    (accumulator[result.category] ??= []).push(result);
    return accumulator;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder="문서번호, 명함, 업체, 담당자, 연락처, 시설, 용역 찾기... (Ctrl+K)" value={query} onValueChange={setQuery} />
      <CommandList>
        {query.trim().length >= 2 && results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{searching ? "전체 업무자료를 찾는 중입니다..." : "검색 결과가 없습니다."}</p>}
        {partialFailure && <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-300">일부 자료를 불러오지 못했습니다. 표시된 결과는 정상적으로 사용할 수 있습니다.</p>}
        {query.length < 2 && recent.length > 0 && <CommandGroup heading="최근 검색">
          {recent.map((item) => <CommandItem key={item} onSelect={() => setQuery(item)}>{item}</CommandItem>)}
        </CommandGroup>}
        {Object.entries(grouped).map(([category, items]) => {
          const Icon = ICONS[category] || FileText;
          return <CommandGroup key={category} heading={category}>
            {items.map((item) => <CommandItem key={`${category}-${item.id}`} value={`${item.label} ${item.sub}`} onSelect={() => selectResult(item)}>
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col"><span className="truncate text-sm">{item.label}</span><span className="truncate text-xs text-muted-foreground">{item.sub}</span></div>
            </CommandItem>)}
          </CommandGroup>;
        })}
      </CommandList>
    </CommandDialog>
  );
}
