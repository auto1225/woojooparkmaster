import { useMemo, useState } from "react";
import { Archive, ArrowDownUp, ArrowRight, FileDown, FileUp, LoaderCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSecureUploadPath, validateUploadFile } from "@/lib/file-security";
import { DOC_CATEGORY_LABELS, DOC_TYPE_LABELS } from "@/types/procurement";

const REQUIRED_DOCUMENTS = ["specification", "task_order", "estimate", "announcement", "contract", "performance_bond"];
const emptyForm = { projectId: "", documentNumber: "", category: "bid", type: "specification", title: "", version: "1.0", description: "" };

export default function ProcurementDocuments() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const canEdit = Boolean(profile && ["admin", "manager", "editor"].includes(profile.role));
  const canArchive = Boolean(profile && ["admin", "manager"].includes(profile.role));
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [showRegister, setShowRegister] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: projects = [] } = useQuery({
    queryKey: ["bid-projects-for-docs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bid_projects").select("id,title,bid_number,document_number").is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["all-bid-documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bid_documents")
        .select("*,bid_projects(title,bid_number,document_number)")
        .eq("is_current", true).is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    return documents.filter((document: any) => {
      if (projectFilter !== "all" && document.bid_project_id !== projectFilter) return false;
      if (categoryFilter !== "all" && document.doc_category !== categoryFilter) return false;
      if (typeFilter !== "all" && document.doc_type !== typeFilter) return false;
      return !keyword || [document.document_number, document.title, document.description, document.version, document.file_format, document.bid_projects?.title, document.bid_projects?.bid_number, document.bid_projects?.document_number]
        .some((value) => String(value || "").toLocaleLowerCase("ko-KR").includes(keyword));
    }).sort((a: any, b: any) => {
      if (sort === "title_asc") return String(a.title).localeCompare(String(b.title), "ko");
      if (sort === "project_asc") return String(a.bid_projects?.title).localeCompare(String(b.bid_projects?.title), "ko");
      if (sort === "version_desc") return String(b.version).localeCompare(String(a.version), "ko", { numeric: true });
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [documents, search, projectFilter, categoryFilter, typeFilter, sort]);

  const projectDocuments = projectFilter === "all" ? [] : documents.filter((document: any) => document.bid_project_id === projectFilter);
  const submittedTypes = new Set(projectDocuments.map((document: any) => document.doc_type));

  const openRegister = () => {
    const selected = projects.find((project: any) => project.id === projectFilter);
    setForm({ ...emptyForm, projectId: projectFilter === "all" ? "" : projectFilter, documentNumber: selected?.document_number || "" });
    setFile(null);
    setRegisterError("");
    setShowRegister(true);
  };

  const handleRegister = async () => {
    const actorId = user?.id || profile?.id;
    if (!actorId) { setRegisterError("사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요."); return; }
    if (!form.projectId || !form.documentNumber.trim() || !form.title.trim() || !file) {
      setRegisterError("사업, 문서번호, 제목, 원문 파일을 모두 입력해주세요."); return;
    }
    setSaving(true);
    setRegisterError("");
    let uploadedPath = "";
    let uploadedBucket = "official-documents";
    try {
      const validation = await validateUploadFile(file, "document");
      if (!validation.isValid) throw new Error(validation.errors.join(" "));
      uploadedPath = `${actorId}/procurement/${form.projectId}/${getSecureUploadPath("document", file.name)}`;
      const { error: uploadError } = await supabase.storage.from(uploadedBucket).upload(uploadedPath, file, { upsert: false });
      if (uploadError) {
        const fallbackAllowed = import.meta.env.DEV && /bucket not found/i.test(uploadError.message)
          && ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(file.type);
        if (!fallbackAllowed) throw uploadError;
        uploadedBucket = "reports";
        const { error: fallbackError } = await supabase.storage.from(uploadedBucket).upload(uploadedPath, file, { upsert: false });
        if (fallbackError) throw fallbackError;
      }
      const { error } = await (supabase as any).rpc("register_bid_document", {
        p_project_id: form.projectId, p_document_number: form.documentNumber.trim(), p_doc_category: form.category,
        p_doc_type: form.type, p_title: form.title.trim(), p_description: form.description.trim() || null,
        p_version: form.version.trim() || "1.0", p_file_path: `${uploadedBucket}://${uploadedPath}`,
        p_file_format: file.name.split(".").pop()?.toLowerCase() || null, p_file_size: file.size,
        p_client_mutation_id: crypto.randomUUID(),
      });
      if (error) throw error;
      toast.success("입찰 문서와 원문 파일을 등록했습니다.");
      setShowRegister(false);
      setForm(emptyForm);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["all-bid-documents"] });
    } catch (error: any) {
      if (uploadedPath) await supabase.storage.from(uploadedBucket).remove([uploadedPath]);
      const message = error.message || "문서 등록에 실패했습니다.";
      setRegisterError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (filePath: string) => {
    const match = filePath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
    if (!match) { toast.error("원문 파일 경로가 올바르지 않습니다."); return; }
    const { data, error } = await supabase.storage.from(match[1]).createSignedUrl(match[2], 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const archiveDocument = async (documentId: string) => {
    const reason = window.prompt("문서 보관 사유를 입력하세요.");
    if (!reason?.trim()) return;
    const { error } = await (supabase as any).rpc("archive_bid_document", { p_document_id: documentId, p_reason: reason.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("문서를 이력으로 보관했습니다.");
    await queryClient.invalidateQueries({ queryKey: ["all-bid-documents"] });
  };

  return <DashboardLayout><div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">입찰 문서</h1><p className="text-sm text-muted-foreground">문서번호와 원문을 입찰사업에 연결하고 최신본을 관리합니다.</p></div>{canEdit && <Button onClick={openRegister}><FileUp className="mr-1.5 h-4 w-4" />문서 등록</Button>}</div>

    <div className="grid gap-2 border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_220px_140px_160px_150px]">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="문서번호·제목·입찰번호·사업명 찾기" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 사업</SelectItem>{projects.map((project: any) => <SelectItem key={project.id} value={project.id}>[{project.bid_number}] {project.title}</SelectItem>)}</SelectContent></Select>
      <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 분류</SelectItem>{Object.entries(DOC_CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 문서유형</SelectItem>{Object.entries(DOC_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={sort} onValueChange={setSort}><SelectTrigger><ArrowDownUp className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created_desc">최근 등록순</SelectItem><SelectItem value="title_asc">제목순</SelectItem><SelectItem value="project_asc">사업명순</SelectItem><SelectItem value="version_desc">버전 높은순</SelectItem></SelectContent></Select>
    </div>

    {projectFilter !== "all" && <Card><CardContent className="p-4"><p className="mb-2 text-sm font-medium">필수 문서 준비도 {submittedTypes.size}/{REQUIRED_DOCUMENTS.length}</p><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{REQUIRED_DOCUMENTS.map((type) => <div key={type} className="flex items-center gap-2 text-sm"><Badge variant={submittedTypes.has(type) ? "default" : "outline"}>{submittedTypes.has(type) ? "완료" : "필요"}</Badge><span>{DOC_TYPE_LABELS[type] || type}</span></div>)}</div></CardContent></Card>}

    <p className="text-sm text-muted-foreground">조회 {filtered.length}건{isLoading ? " · 불러오는 중" : ""}</p>
    <div className="grid gap-3 md:hidden">{filtered.map((document: any) => <Card key={document.id}><CardContent className="space-y-3 p-4"><div><p className="font-mono text-xs text-muted-foreground">{document.document_number || "문서번호 미등록"}</p><p className="font-semibold">{document.title}</p><p className="text-sm text-muted-foreground">{document.bid_projects?.title}</p></div><div className="flex flex-wrap gap-1"><Badge variant="outline">{DOC_CATEGORY_LABELS[document.doc_category] || document.doc_category}</Badge><Badge variant="outline">{DOC_TYPE_LABELS[document.doc_type] || document.doc_type}</Badge><Badge variant="outline">버전 {document.version}</Badge></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openFile(document.file_path)}><FileDown className="mr-1 h-4 w-4" />원문</Button><Button size="sm" variant="outline" onClick={() => navigate(`/procurement/projects/${document.bid_project_id}?tab=documents`)}>사업<ArrowRight className="ml-1 h-4 w-4" /></Button>{canArchive && <Button size="icon" variant="ghost" title="이력 보관" onClick={() => archiveDocument(document.id)}><Archive className="h-4 w-4" /></Button>}</div></CardContent></Card>)}</div>

    <Card className="hidden md:block"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>문서번호 / 사업</TableHead><TableHead>분류</TableHead><TableHead>문서유형</TableHead><TableHead>제목</TableHead><TableHead>버전·형식</TableHead><TableHead>등록일</TableHead><TableHead className="text-right">실행</TableHead></TableRow></TableHeader><TableBody>{filtered.map((document: any) => <TableRow key={document.id}><TableCell><p className="font-mono text-sm">{document.document_number || "-"}</p><p className="max-w-60 truncate text-xs text-muted-foreground">[{document.bid_projects?.bid_number}] {document.bid_projects?.title}</p></TableCell><TableCell><Badge variant="outline">{DOC_CATEGORY_LABELS[document.doc_category] || document.doc_category}</Badge></TableCell><TableCell>{DOC_TYPE_LABELS[document.doc_type] || document.doc_type}</TableCell><TableCell className="font-medium">{document.title}</TableCell><TableCell>{document.version} · {document.file_format || "-"}</TableCell><TableCell>{document.created_at?.split("T")[0]}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="원문 열기" onClick={() => openFile(document.file_path)}><FileDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="사업 보기" onClick={() => navigate(`/procurement/projects/${document.bid_project_id}?tab=documents`)}><ArrowRight className="h-4 w-4" /></Button>{canArchive && <Button size="icon" variant="ghost" title="이력 보관" onClick={() => archiveDocument(document.id)}><Archive className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">조건에 맞는 입찰 문서가 없습니다.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>

    <Dialog open={showRegister} onOpenChange={setShowRegister}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>입찰 문서 등록</DialogTitle></DialogHeader><div className="space-y-3">
      <div><Label>입찰사업 *</Label><Select value={form.projectId} onValueChange={(projectId) => { const project = projects.find((item: any) => item.id === projectId); setForm((current) => ({ ...current, projectId, documentNumber: current.documentNumber || project?.document_number || "" })); }}><SelectTrigger><SelectValue placeholder="사업 선택" /></SelectTrigger><SelectContent>{projects.map((project: any) => <SelectItem key={project.id} value={project.id}>[{project.bid_number}] {project.title}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>근거 문서번호 *</Label><Input value={form.documentNumber} onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))} placeholder="제주시청-차량관리과-2026-0000" /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>분류 *</Label><Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>문서유형 *</Label><Select value={form.type} onValueChange={(type) => setForm((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid grid-cols-[1fr_100px] gap-3"><div><Label>제목 *</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div><Label>버전</Label><Input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></div></div>
      <div><Label>원문 파일 *</Label><Input type="file" accept=".pdf,.hwp,.docx,.xlsx,.pptx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
      <div><Label>설명</Label><Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
      {registerError && <p role="alert" className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{registerError}</p>}
    </div><DialogFooter><Button variant="outline" onClick={() => setShowRegister(false)}>취소</Button><Button onClick={handleRegister} disabled={saving || !form.projectId || !form.documentNumber.trim() || !form.title.trim() || !file}>{saving && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}등록</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}
