import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Link2, Paperclip, Plus, RotateCcw, Search } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { OfficialDocumentDialog } from "@/components/documents/OfficialDocumentDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENT_MODULE_LABELS, listOfficialDocuments, normalizeDocumentNumber } from "@/lib/official-document-registry";
import { useAuth } from "@/hooks/useAuth";
import { stableMultiSort, type NullPlacement, type SortDirection } from "@/lib/list-sorting";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";

const DIRECTION_LABELS = { outgoing: "발신", incoming: "수신", internal: "내부" };
const STATUS_LABELS = { draft: "작성중", registered: "등록", sent: "발송", received: "접수", archived: "보존" };

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originalFilter, setOriginalFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState("documentDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [secondarySortKey, setSecondarySortKey] = useState("documentNumber");
  const [nullPlacement, setNullPlacement] = useState<NullPlacement>("last");
  const [dialogOpen, setDialogOpen] = useState(false);
  const canManage = ["admin", "manager", "editor"].includes(profile?.role || "");
  const { data = [], isLoading } = useQuery({
    queryKey: ["official-document-list"],
    queryFn: () => listOfficialDocuments(),
  });
  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);
  const rows = useMemo(() => {
    const normalizedSearch = normalizeDocumentNumber(search);
    const loweredSearch = search.trim().toLocaleLowerCase("ko");
    const valueFor = (document: (typeof data)[number], key: string) => {
      if (key === "linkCount") return document.linkCount || 0;
      if (key === "lotType") return document.parkingLots?.[0]?.lotType || null;
      if (key === "hasOriginalFile") return document.hasOriginalFile ? 1 : 0;
      return document[key as keyof typeof document];
    };
    return stableMultiSort(
      data.filter((document) => {
        if (directionFilter !== "all" && document.direction !== directionFilter) return false;
        if (statusFilter !== "all" && document.status !== statusFilter) return false;
        if (originalFilter === "present" && !document.hasOriginalFile) return false;
        if (originalFilter === "missing" && document.hasOriginalFile) return false;
        if (lotTypeFilter !== "all" && !document.parkingLots?.some((lot) => lot.lotType === lotTypeFilter)) return false;
        if (moduleFilter !== "all" && !document.linkedModules?.includes(moduleFilter)) return false;
        if (documentTypeFilter !== "all" && document.documentType !== documentTypeFilter) return false;
        if (dateFrom && (!document.documentDate || document.documentDate < dateFrom)) return false;
        if (dateTo && (!document.documentDate || document.documentDate > dateTo)) return false;
        if (!loweredSearch) return true;
        return document.normalizedNumber.includes(normalizedSearch)
          || document.title.toLocaleLowerCase("ko").includes(loweredSearch)
          || (document.department || "").toLocaleLowerCase("ko").includes(loweredSearch)
          || (document.senderOrganization || "").toLocaleLowerCase("ko").includes(loweredSearch)
          || (document.receiverOrganization || "").toLocaleLowerCase("ko").includes(loweredSearch)
          || (document.notes || "").toLocaleLowerCase("ko").includes(loweredSearch)
          || document.parkingLots?.some((lot) => `${lot.code} ${lot.name}`.toLocaleLowerCase("ko").includes(loweredSearch));
      }),
      [
        { value: (document) => valueFor(document, sortKey), direction: sortDirection },
        ...(secondarySortKey !== "none" && secondarySortKey !== sortKey ? [{ value: (document: (typeof data)[number]) => valueFor(document, secondarySortKey), direction: "asc" as const }] : []),
      ],
      nullPlacement,
    );
  }, [data, dateFrom, dateTo, directionFilter, documentTypeFilter, lotTypeFilter, moduleFilter, nullPlacement, originalFilter, search, secondarySortKey, sortDirection, sortKey, statusFilter]);

  const sortOptions = [
    ["documentDate", "시행·접수일"], ["documentNumber", "문서번호"], ["title", "제목"],
    ["updatedAt", "최근 수정일"], ["direction", "발신·수신 구분"], ["documentType", "문서 종류"], ["status", "처리 상태"],
    ["department", "담당 부서"], ["lotType", "주차장 형태"], ["hasOriginalFile", "원문 유무"], ["linkCount", "연결 건수"],
  ] as const;

  const documentTypes = Array.from(new Set(data.map((document) => document.documentType))).sort((a, b) => a.localeCompare(b, "ko"));
  const linkedModules = Array.from(new Set(data.flatMap((document) => document.linkedModules || []))).sort((a, b) => (DOCUMENT_MODULE_LABELS[a] || a).localeCompare(DOCUMENT_MODULE_LABELS[b] || b, "ko"));
  const missingOriginalCount = data.filter((document) => !document.hasOriginalFile && document.status !== "draft").length;
  const unlinkedCount = data.filter((document) => !document.linkCount).length;
  const resetFilters = () => {
    setSearch(""); setDirectionFilter("all"); setStatusFilter("all"); setOriginalFilter("all"); setLotTypeFilter("all");
    setModuleFilter("all"); setDocumentTypeFilter("all"); setDateFrom(""); setDateTo("");
  };

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
        <div className="grid grid-cols-3 divide-x rounded-md border bg-card">
          <div className="p-3"><p className="text-xs text-muted-foreground">전체 문서</p><p className="mt-1 text-lg font-semibold">{data.length}건</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">원문 확인 필요</p><p className="mt-1 text-lg font-semibold text-amber-700">{missingOriginalCount}건</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">업무 미연결</p><p className="mt-1 text-lg font-semibold">{unlinkedCount}건</p></div>
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="문서번호, 제목, 부서, 기관, 주차장 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <Select value={directionFilter} onValueChange={setDirectionFilter}><SelectTrigger aria-label="문서 구분 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 구분</SelectItem>{Object.entries(DIRECTION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="처리 상태 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={originalFilter} onValueChange={setOriginalFilter}><SelectTrigger aria-label="원문 파일 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">원문 전체</SelectItem><SelectItem value="present">원문 있음</SelectItem><SelectItem value="missing">원문 없음</SelectItem></SelectContent></Select>
              <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger aria-label="주차장 형태 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{(["offstreet", "multilevel", "onstreet"] as LotType[]).map((value) => <SelectItem key={value} value={value}>{LOT_TYPE_LABELS[value]}</SelectItem>)}</SelectContent></Select>
              <Select value={moduleFilter} onValueChange={setModuleFilter}><SelectTrigger aria-label="연결 업무 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 연결 업무</SelectItem>{linkedModules.map((value) => <SelectItem key={value} value={value}>{DOCUMENT_MODULE_LABELS[value] || value}</SelectItem>)}</SelectContent></Select>
              <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}><SelectTrigger aria-label="문서 종류 필터"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 문서 종류</SelectItem>{documentTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
              <div className="grid grid-cols-2 gap-2"><Input aria-label="시작일" title="시작일" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><Input aria-label="종료일" title="종료일" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[160px_auto_180px_140px_1fr_auto]">
              <Select value={sortKey} onValueChange={setSortKey}><SelectTrigger aria-label="1차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent>{sortOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Button type="button" variant="outline" size="icon" aria-label="1차 정렬 방향" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
              <Select value={secondarySortKey} onValueChange={setSecondarySortKey}><SelectTrigger aria-label="2차 정렬 기준"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">2차 정렬 없음</SelectItem>{sortOptions.filter(([value]) => value !== sortKey).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={nullPlacement} onValueChange={(value) => setNullPlacement(value as NullPlacement)}><SelectTrigger aria-label="빈값 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last">빈값 뒤로</SelectItem><SelectItem value="first">빈값 앞으로</SelectItem></SelectContent></Select>
              <div />
              <Button type="button" variant="ghost" onClick={resetFilters}><RotateCcw className="mr-1.5 h-4 w-4" />초기화</Button>
            </div>
          </CardContent>
        </Card>
        <div className="hidden overflow-x-auto rounded-md border bg-card md:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead sortable={false}>문서번호</TableHead><TableHead sortable={false}>제목</TableHead><TableHead sortable={false}>구분</TableHead><TableHead sortable={false}>종류</TableHead><TableHead sortable={false}>시행·접수일</TableHead><TableHead sortable={false}>담당 부서</TableHead><TableHead sortable={false} className="text-right">연결</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={7} className="h-32 text-center">불러오는 중...</TableCell></TableRow> : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground"><FileText className="mx-auto mb-2 h-7 w-7" />{data.length === 0 ? "등록된 문서가 없습니다." : "조건에 맞는 문서가 없습니다."}{data.length > 0 && <Button type="button" variant="link" className="mx-auto mt-1 block" onClick={() => { setSearch(""); setDirectionFilter("all"); }}>검색 조건 초기화</Button>}</TableCell></TableRow>
              ) : rows.map((document) => (
                <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(`/documents/${document.id}`)}>
                  <TableCell><button type="button" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); navigate(`/documents/${document.id}`); }}>{document.documentNumber}</button></TableCell>
                  <TableCell>{document.title}</TableCell>
                  <TableCell><Badge variant="outline">{DIRECTION_LABELS[document.direction]}</Badge></TableCell>
                  <TableCell><div>{document.documentType}</div><div className="mt-1 flex flex-wrap gap-1"><Badge variant="secondary" className="text-[10px]">{STATUS_LABELS[document.status]}</Badge>{!document.hasOriginalFile && document.status !== "draft" && <Badge variant="destructive" className="text-[10px]">원문 없음</Badge>}</div></TableCell>
                  <TableCell>{document.documentDate || "-"}</TableCell>
                  <TableCell>{document.department || "-"}</TableCell>
                  <TableCell className="text-right"><span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{document.linkCount || 0}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-2 md:hidden">
          {isLoading ? <div className="rounded-md border bg-card p-8 text-center text-sm">불러오는 중...</div> : rows.length === 0 ? <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{data.length === 0 ? "등록된 문서가 없습니다." : "조건에 맞는 문서가 없습니다."}</div> : rows.map((document) => (
            <button key={document.id} type="button" className="w-full rounded-md border bg-card p-4 text-left" onClick={() => navigate(`/documents/${document.id}`)}>
              <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-all font-mono text-xs font-semibold text-primary">{document.documentNumber}</span><Badge variant="outline" className="shrink-0">{DIRECTION_LABELS[document.direction]}</Badge></div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold">{document.title}</p>
              <div className="mt-3 flex flex-wrap gap-1.5"><Badge variant="secondary">{STATUS_LABELS[document.status]}</Badge><Badge variant="outline">{document.documentType}</Badge>{document.parkingLots?.map((lot) => <Badge key={lot.id} variant="outline">{LOT_TYPE_LABELS[lot.lotType as LotType] || lot.lotType}</Badge>)}</div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{document.documentDate || "시행·접수일 미지정"}</span><span className="flex shrink-0 items-center gap-3"><span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{document.hasOriginalFile ? "원문" : "없음"}</span><span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{document.linkCount || 0}</span></span></div>
            </button>
          ))}
        </div>
      </div>
      <OfficialDocumentDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={async () => queryClient.invalidateQueries({ queryKey: ["official-document-list"] })} />
    </DashboardLayout>
  );
}
