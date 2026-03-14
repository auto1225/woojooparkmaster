import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { helpArticles, MODULE_LABELS } from "@/data/help-content";

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(helpArticles[0]?.id || null);

  const modules = useMemo(() => {
    const map: Record<string, typeof helpArticles> = {};
    helpArticles.forEach(a => {
      if (!map[a.module]) map[a.module] = [];
      map[a.module].push(a);
    });
    return map;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    return helpArticles.filter(a =>
      a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.tags.some(t => t.includes(q))
    );
  }, [search]);

  const selected = selectedId ? helpArticles.find(a => a.id === selectedId) : null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">도움말</h1>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          {/* Left: TOC */}
          <ScrollArea className="h-[calc(100vh-200px)] border rounded-lg p-2">
            {filtered ? (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground px-2 mb-2">{filtered.length}개 결과</p>
                {filtered.map(a => (
                  <button key={a.id} onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left px-3 py-2 rounded text-xs hover:bg-muted ${selectedId === a.id ? 'bg-muted font-medium' : ''}`}>
                    {a.title}
                  </button>
                ))}
              </div>
            ) : (
              <Accordion type="multiple" defaultValue={Object.keys(modules)}>
                {Object.entries(modules).map(([mod, articles]) => (
                  <AccordionItem key={mod} value={mod}>
                    <AccordionTrigger className="text-xs py-2 px-2">
                      {MODULE_LABELS[mod] || mod} <Badge variant="secondary" className="ml-auto text-[9px]">{articles.length}</Badge>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      {articles.sort((a, b) => a.order - b.order).map(a => (
                        <button key={a.id} onClick={() => setSelectedId(a.id)}
                          className={`w-full text-left px-4 py-1.5 rounded text-xs hover:bg-muted ${selectedId === a.id ? 'bg-muted font-medium' : ''}`}>
                          {a.title}
                        </button>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </ScrollArea>

          {/* Right: Content */}
          <div className="border rounded-lg p-6 min-h-[400px]">
            {selected ? (
              <>
                <Badge variant="secondary" className="mb-3 text-[10px]">{MODULE_LABELS[selected.module]}</Badge>
                <h2 className="text-lg font-semibold mb-4">{selected.title}</h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {selected.content.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h3 key={i} className="text-base font-semibold mt-4 mb-2">{line.slice(3)}</h3>;
                    if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h4>;
                    if (line.startsWith('- ')) return <li key={i} className="ml-4 text-sm text-muted-foreground">{line.slice(2)}</li>;
                    if (line.match(/^\d+\./)) return <li key={i} className="ml-4 text-sm text-muted-foreground list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
                    if (line.trim() === '') return <br key={i} />;
                    return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
                  })}
                </div>
                <div className="mt-6 flex gap-1.5">
                  {selected.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-20">좌측 목차에서 도움말을 선택하세요</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
