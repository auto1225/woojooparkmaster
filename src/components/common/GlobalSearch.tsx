import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Building2, MessageSquare, Gavel, Briefcase, FileText } from "lucide-react";

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  path: string;
  category: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isModuleActive = useCallback(
    (code: string) => (licenses ?? []).some((m: any) => m.module_code === code && m.is_active),
    [licenses]
  );

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem("parkmaster-recent-searches");
      if (stored) setRecent(JSON.parse(stored));
    } catch {}
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      const all: SearchResult[] = [];
      const term = `%${q}%`;

      // 주차장
      const { data: lots } = await supabase
        .from("parking_lots")
        .select("id, name, code, address_jibun")
        .or(`name.ilike.${term},code.ilike.${term},address_jibun.ilike.${term}`)
        .limit(5);
      lots?.forEach((l) =>
        all.push({ id: l.id, label: `${l.name} (${l.code})`, sub: l.address_jibun || "", path: `/lots/${l.id}`, category: "주차장" })
      );

      // 민원
      if (isModuleActive("COMPLAINT")) {
        const { data: complaints } = await supabase
          .from("complaints")
          .select("id, complaint_number, title")
          .or(`complaint_number.ilike.${term},title.ilike.${term}`)
          .limit(5);
        complaints?.forEach((c) =>
          all.push({ id: c.id, label: `${c.complaint_number}`, sub: c.title, path: `/complaints/${c.id}`, category: "민원" })
        );
      }

      // 입찰
      if (isModuleActive("PROCUREMENT")) {
        const { data: bids } = await supabase
          .from("bid_projects")
          .select("id, bid_number, title")
          .or(`bid_number.ilike.${term},title.ilike.${term}`)
          .limit(5);
        bids?.forEach((b) =>
          all.push({ id: b.id, label: `${b.bid_number}`, sub: b.title, path: `/procurement/projects/${b.id}`, category: "입찰" })
        );
      }

      // 용역
      if (isModuleActive("SERVICE")) {
        const { data: svc } = await supabase
          .from("service_projects")
          .select("id, project_number, title")
          .or(`project_number.ilike.${term},title.ilike.${term}`)
          .limit(5);
        svc?.forEach((s) =>
          all.push({ id: s.id, label: `${s.project_number}`, sub: s.title, path: `/service/projects/${s.id}`, category: "용역" })
        );
      }

      setResults(all);
    },
    [isModuleActive]
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    // Save to recent
    const updated = [result.label, ...recent.filter((r) => r !== result.label)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem("parkmaster-recent-searches", JSON.stringify(updated));

    setOpen(false);
    setQuery("");
    navigate(result.path);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const ICONS: Record<string, any> = {
    주차장: Building2, 민원: MessageSquare, 입찰: Gavel, 용역: Briefcase, 계약: FileText,
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="주차장, 민원, 입찰, 용역 검색... (Ctrl+K)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>검색 결과가 없습니다</CommandEmpty>
        {query.length < 2 && recent.length > 0 && (
          <CommandGroup heading="최근 검색">
            {recent.map((r, i) => (
              <CommandItem key={i} onSelect={() => setQuery(r)}>
                {r}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {Object.entries(grouped).map(([category, items]) => {
          const Icon = ICONS[category] || FileText;
          return (
            <CommandGroup key={category} heading={category}>
              {items.map((item) => (
                <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
                  <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.sub}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
