import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Plus, Search } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { OfficialDocumentDialog } from "@/components/documents/OfficialDocumentDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listOfficialDocuments } from "@/lib/official-document-registry";
import { useAuth } from "@/hooks/useAuth";
import { stableMultiSort, type NullPlacement, type SortDirection } from "@/lib/list-sorting";

const DIRECTION_LABELS = { outgoing: "발신", incoming: "수신", internal: "내부" };

export default function Documents() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [sortKey, setSortKey] = useState("documentDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [secondarySortKey, setSecondarySortKey] = useState("documentNumber");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [dialogOpen, setDialogOpen] = useState(false);
  const canManage = ["admin", "manager", "editor"].includes(profile?.role || "");
  const { data = [], isLoading } = useQuery({
    queryKey: ["official-document-list", search],
    queryFn: () => listOfficialDocuments(search),
  });
  const rows = useMemo(() => {
    const valueFor = (document: (typeof data)[number], key: string) => key === "linkCount"
      ? document.linkCount || 0
      : document[key as keyof typeof document];
    return stableMultiSort(
      data.filter((document) => directionFilter === "all" || document.direction === directionFilter),
      [
        { value: (document) => valueFor(document, sortKey), direction: sortDirection },
        ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (document: (typeof data)[number]) => valueFor(document, secondarySortKey), direction: "asc" as const }] : []),
      ],
      nullPlacement,
    );
  }, [data, directionFilter, nullPlacement, secondarySortKey, sortDirection, sortKey]);

  const sortOptions = [
    ["documentDate", "시행·접수일"], ["documentNumber", "문서번호"], ["title", "제목"],
    ["direction", "발신·수신 구분"], ["documentType", "문서 종류"], ["department", "담당 부서"], ["linkCount", "연결 건수"],
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">문서대장</h1>
            <p className="mt-1 text-sm text-muted-foreground">총 {data.length}건 중 {rows.length}건</p>
          </div>
          {canManage && <Button onClick={() => setDialogOpen(true)}><Plus className="mr-1.5 h-4 w-4" />문서 등록</Button>}
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_140px_160px_auto_160px_120px]">
              <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="문서번호, 제목, 담당 부서 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <Select value={directionFilter} onValueChange={setDirectionFilter}><SelectTrigger aria-label="문서 구분 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 구분</SelectItem>{Object.entries(DIRECTION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={sortKey} onValueChange={setSortKey}><SelectTrigger aria-label="1차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent>{sortOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Button type="button" variant="outline" size="icon" aria-label="1차 정렬 방향" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
              <Select value={secondarySortKey} onValueChange={setSecondarySortKey}><SelectTrigger aria-label="2차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">2차 정렬 없음</SelectItem>{sortOptions.filter(([value]) => value !== sortKey).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={nullPlacement} onValueChange={(value) => setNullPlacement(value as NullPlacement)}><SelectTrigger aria-label="빈값 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last">빈값 뒤로</SelectItem><SelectItem value="first">빈값 앞으로</SelectItem></SelectContent></Select>
            </div>
          </CardContent>
        </Card>
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>문서번호</TableHead><TableHead>제목</TableHead><TableHead>구분</TableHead><TableHead>종류</TableHead><TableHead>시행·접수일</TableHead><TableHead>담당 부서</TableHead><TableHead className="text-right">연결</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={7} className="h-32 text-center">불러오는 중...</TableCell></TableRow> : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground"><FileText className="mx-auto mb-2 h-7 w-7" />등록된 문서가 없습니다.</TableCell></TableRow>
              ) : rows.map((document) => (
                <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(`/documents/${document.id}`)}>
                  <TableCell className="font-medium text-primary">{document.documentNumber}</TableCell>
                  <TableCell>{document.title}</TableCell>
                  <TableCell><Badge variant="outline">{DIRECTION_LABELS[document.direction]}</Badge></TableCell>
                  <TableCell>{document.documentType}</TableCell>
                  <TableCell>{document.documentDate || "-"}</TableCell>
                  <TableCell>{document.department || "-"}</TableCell>
                  <TableCell className="text-right">{document.linkCount || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <OfficialDocumentDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={async () => queryClient.invalidateQueries({ queryKey: ["official-document-list"] })} />
    </DashboardLayout>
  );
}
