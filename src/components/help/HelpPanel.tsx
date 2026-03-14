import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, Search, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { helpArticles, getModuleFromPath, MODULE_LABELS } from "@/data/help-content";

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const currentModule = getModuleFromPath(location.pathname);

  const filtered = useMemo(() => {
    if (search) {
      const q = search.toLowerCase();
      return helpArticles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        a.tags.some(t => t.includes(q))
      );
    }
    if (currentModule) {
      return helpArticles.filter(a => a.module === currentModule);
    }
    return helpArticles.slice(0, 10);
  }, [search, currentModule]);

  const selected = selectedId ? helpArticles.find(a => a.id === selectedId) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 h-10 w-10 rounded-full shadow-lg"
            variant="default"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[380px] sm:w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle className="text-base">도움말</SheetTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedId(null); }}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6" onClick={() => setSearch("")}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {selected ? (
              <div className="p-4">
                <Button variant="ghost" size="sm" className="mb-3 text-xs" onClick={() => setSelectedId(null)}>
                  ← 목록으로
                </Button>
                <Badge variant="secondary" className="mb-2 text-[10px]">{MODULE_LABELS[selected.module]}</Badge>
                <h3 className="text-sm font-semibold mb-3">{selected.title}</h3>
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed whitespace-pre-line">
                  {selected.content.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h4 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(3)}</h4>;
                    if (line.startsWith('### ')) return <h5 key={i} className="text-xs font-semibold mt-2 mb-1">{line.slice(4)}</h5>;
                    if (line.startsWith('- ')) return <li key={i} className="ml-4 text-xs text-muted-foreground">{line.slice(2)}</li>;
                    if (line.match(/^\d+\./)) return <li key={i} className="ml-4 text-xs text-muted-foreground list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
                    if (line.trim() === '') return <br key={i} />;
                    return <p key={i} className="text-xs text-muted-foreground">{line}</p>;
                  })}
                </div>
              </div>
            ) : (
              <div className="p-2">
                {currentModule && !search && (
                  <div className="px-2 py-1.5 mb-1">
                    <span className="text-[10px] text-muted-foreground font-medium">현재 모듈: {MODULE_LABELS[currentModule]}</span>
                  </div>
                )}
                {filtered.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">검색 결과가 없습니다</p>
                )}
                {filtered.map(article => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedId(article.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted rounded-md flex items-center justify-between group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{article.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{MODULE_LABELS[article.module]}</div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-4 py-2.5">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); navigate('/help'); }}>
              전체 도움말 보기
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
