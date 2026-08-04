import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listOfficialDocuments } from "@/lib/official-document-registry";
import type { OfficialDocument } from "@/types/official-document";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (document: OfficialDocument) => Promise<void> | void;
  onCreateNew: () => void;
  excludedIds?: string[];
}

export function LinkDocumentDialog({ open, onOpenChange, onSelect, onCreateNew, excludedIds = [] }: Props) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OfficialDocument | null>(null);
  const [linking, setLinking] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["official-document-picker", deferredSearch],
    queryFn: () => listOfficialDocuments(deferredSearch),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(null);
    }
  }, [open]);

  const available = data.filter((document) => !excludedIds.includes(document.id));
  const submit = async () => {
    if (!selected) return;
    setLinking(true);
    try {
      await onSelect(selected);
      onOpenChange(false);
    } catch (error: any) {
      toast.error("문서를 연결하지 못했습니다.", { description: error.message });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>기존 문서 연결</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="문서번호, 제목, 담당 부서 검색" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">문서를 불러오는 중...</p> : isError ? (
            <div className="p-8 text-center"><p className="text-sm text-destructive">문서를 불러오지 못했습니다.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>다시 시도</Button></div>
          ) : available.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">연결할 수 있는 문서가 없습니다.</p> : (
            <div className="divide-y">
              {available.map((document) => (
                <button key={document.id} type="button" className={`flex w-full items-start gap-3 p-3 text-left hover:bg-muted/60 ${selected?.id === document.id ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`} onClick={() => setSelected(document)}>
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.documentNumber}</span><span className="block truncate text-xs text-muted-foreground">{document.title}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{document.department || document.documentType}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {profile?.role === "admin" ? <Button variant="outline" onClick={() => { onOpenChange(false); onCreateNew(); }}><Plus className="mr-1.5 h-4 w-4" />새 문서 등록</Button> : <span />}
          <div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button><Button onClick={submit} disabled={!selected || linking}>{linking ? "연결 중..." : "선택 문서 연결"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
