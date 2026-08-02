import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { recognize } from "tesseract.js";
import { Building2, Camera, ContactRound, Loader2, Mail, Pencil, Phone, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { archiveBusinessCard, getBusinessCardImageUrl, listBusinessCards, matchesBusinessCard, saveBusinessCard, type BusinessCard } from "@/lib/business-card-registry";
import { businessCardCompleteness, parseBusinessCardText, type BusinessCardFields } from "@/lib/business-card-ocr";

type CardForm = BusinessCardFields & { id: string; memo: string; tagsText: string; imagePath: string; imageName: string };

const blankForm = (): CardForm => ({
  id: "", name: "", company: "", department: "", position: "", mobile: "", phone: "", fax: "",
  email: "", website: "", address: "", rawText: "", memo: "", tagsText: "", imagePath: "", imageName: "",
});

export default function BusinessCards() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [sort, setSort] = useState("recent");
  const [formOpen, setFormOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<BusinessCard | null>(null);
  const [deleteCard, setDeleteCard] = useState<BusinessCard | null>(null);
  const [form, setForm] = useState<CardForm>(blankForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detailImageUrl, setDetailImageUrl] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [recognizing, setRecognizing] = useState(false);

  const { data: cards = [], isLoading } = useQuery({ queryKey: ["business-cards"], queryFn: listBusinessCards });

  useEffect(() => {
    const requestedId = searchParams.get("card");
    if (!requestedId || !cards.length) return;
    const requested = cards.find((card) => card.id === requestedId);
    if (requested) setDetailCard(requested);
  }, [cards, searchParams]);

  useEffect(() => () => { if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    let active = true;
    setDetailImageUrl("");
    if (detailCard?.imagePath) getBusinessCardImageUrl(detailCard.imagePath).then((url) => { if (active) setDetailImageUrl(url); }).catch(() => undefined);
    return () => { active = false; };
  }, [detailCard]);

  const companies = useMemo(() => Array.from(new Set(cards.map((card) => card.company).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [cards]);
  const filtered = useMemo(() => {
    const rows = cards.filter((card) => (company === "all" || card.company === company) && (!query.trim() || matchesBusinessCard(card, query)));
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ko");
      if (sort === "company") return `${a.company}${a.name}`.localeCompare(`${b.company}${b.name}`, "ko");
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [cards, company, query, sort]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() && !form.company.trim()) throw new Error("이름 또는 회사명을 입력해 주세요.");
      return saveBusinessCard({
        id: form.id, name: form.name.trim(), company: form.company.trim(), department: form.department.trim(),
        position: form.position.trim(), mobile: form.mobile.trim(), phone: form.phone.trim(), fax: form.fax.trim(),
        email: form.email.trim(), website: form.website.trim(), address: form.address.trim(), rawText: form.rawText.trim(),
        memo: form.memo.trim(), tags: form.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
        imagePath: form.imagePath, imageName: form.imageName,
      }, imageFile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-cards"] });
      setFormOpen(false);
      toast.success(form.id ? "명함 정보를 수정했습니다." : "명함을 등록했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: archiveBusinessCard,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["business-cards"] }); setDeleteCard(null); setDetailCard(null); toast.success("명함을 삭제했습니다."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetEditor = () => {
    setForm(blankForm()); setImageFile(null); setPreviewUrl(""); setOcrProgress(0); setOcrStatus(""); setRecognizing(false);
  };
  const openNew = () => { resetEditor(); setFormOpen(true); };
  const openEdit = async (card: BusinessCard) => {
    setDetailCard(null); setImageFile(null); setPreviewUrl(""); setOcrProgress(0); setOcrStatus("");
    setForm({ ...card, tagsText: card.tags.join(", ") });
    if (card.imagePath) {
      try { setPreviewUrl(await getBusinessCardImageUrl(card.imagePath)); } catch { toast.error("원본 명함 이미지를 불러오지 못했습니다."); }
    }
    setFormOpen(true);
  };

  const runOcr = async (file: File) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return toast.error("JPG, PNG, WEBP 이미지를 선택해 주세요.");
    if (file.size > 10 * 1024 * 1024) return toast.error("이미지는 10MB 이하만 등록할 수 있습니다.");
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); setRecognizing(true); setOcrProgress(1); setOcrStatus("OCR 엔진 준비 중");
    try {
      const result = await recognize(file, "kor+eng", { logger: (message) => {
        if (typeof message.progress === "number") setOcrProgress(Math.max(1, Math.round(message.progress * 100)));
        const labels: Record<string, string> = { "loading tesseract core": "문자 인식 엔진 로딩", "loading language traineddata": "한글·영문 사전 로딩", "initializing api": "인식 준비", "recognizing text": "명함 문자 인식" };
        setOcrStatus(labels[message.status] || "명함 분석 중");
      } });
      const parsed = parseBusinessCardText(result.data.text);
      setForm((current) => ({ ...current, ...parsed, id: current.id, memo: current.memo, tagsText: current.tagsText, imagePath: current.imagePath, imageName: file.name }));
      setOcrProgress(100); setOcrStatus(`자동 정리 완료 · 주요 항목 ${businessCardCompleteness(parsed)}% 인식`);
      toast.success("명함 텍스트를 추출하고 항목별로 정리했습니다.");
    } catch (error) {
      setOcrStatus("자동 인식 실패"); toast.error(error instanceof Error ? error.message : "명함을 인식하지 못했습니다.");
    } finally { setRecognizing(false); }
  };

  const field = (key: keyof CardForm, label: string, placeholder = "", type = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`card-${key}`}>{label}</Label><Input id={`card-${key}`} type={type} value={String(form[key] || "")} placeholder={placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>
  );

  return <DashboardLayout>
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold">명함관리</h1><p className="mt-1 text-sm text-muted-foreground">업무 관계자의 명함을 이미지로 등록하고 연락처를 검색·관리합니다.</p></div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />명함 등록</Button>
      </div>

      <div className="grid grid-cols-2 border-y bg-background md:grid-cols-4">
        <div className="px-4 py-3"><p className="text-xs text-muted-foreground">등록 명함</p><p className="mt-1 text-xl font-semibold">{cards.length}장</p></div>
        <div className="border-l px-4 py-3"><p className="text-xs text-muted-foreground">관련 회사</p><p className="mt-1 text-xl font-semibold">{companies.length}개</p></div>
        <div className="border-l px-4 py-3"><p className="text-xs text-muted-foreground">휴대전화 등록</p><p className="mt-1 text-xl font-semibold">{cards.filter((card) => card.mobile).length}건</p></div>
        <div className="border-l px-4 py-3"><p className="text-xs text-muted-foreground">이메일 등록</p><p className="mt-1 text-xl font-semibold">{cards.filter((card) => card.email).length}건</p></div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 회사, 부서, 직책, 전화번호, 이메일, 주소 찾기" /></div>
        <Select value={company} onValueChange={setCompany}><SelectTrigger className="w-full md:w-52" aria-label="회사 필터"><SelectValue placeholder="전체 회사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 회사</SelectItem>{companies.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-full md:w-44" aria-label="정렬 기준"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">최근 등록순</SelectItem><SelectItem value="updated">최근 수정순</SelectItem><SelectItem value="name">이름순</SelectItem><SelectItem value="company">회사·이름순</SelectItem></SelectContent></Select>
      </div>

      <div className="overflow-hidden border bg-background">
        <Table><TableHeader><TableRow><TableHead>이름</TableHead><TableHead>회사·부서</TableHead><TableHead>직책</TableHead><TableHead>연락처</TableHead><TableHead>이메일</TableHead><TableHead>등록일</TableHead><TableHead className="w-24 text-right">관리</TableHead></TableRow></TableHeader>
          <TableBody>{isLoading ? <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground">{cards.length ? "검색 조건에 맞는 명함이 없습니다." : "등록된 명함이 없습니다. 명함 이미지를 등록해 주세요."}</TableCell></TableRow> : filtered.map((card) => <TableRow key={card.id} className="cursor-pointer" onClick={() => setDetailCard(card)}>
            <TableCell><div className="font-medium">{card.name || "이름 미확인"}</div>{card.imagePath && <span className="text-xs text-muted-foreground">원본 이미지</span>}</TableCell>
            <TableCell><div>{card.company || "-"}</div><div className="text-xs text-muted-foreground">{card.department}</div></TableCell><TableCell>{card.position || "-"}</TableCell>
            <TableCell><div>{card.mobile || card.phone || "-"}</div>{card.mobile && card.phone && <div className="text-xs text-muted-foreground">{card.phone}</div>}</TableCell><TableCell>{card.email || "-"}</TableCell><TableCell>{card.createdAt ? card.createdAt.slice(0, 10) : "-"}</TableCell>
            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}><Button variant="ghost" size="icon" aria-label={`${card.name} 수정`} onClick={() => void openEdit(card)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`${card.name} 삭제`} onClick={() => setDeleteCard(card)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
          </TableRow>)}</TableBody></Table>
      </div>
    </div>

    <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetEditor(); }}><DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
      <DialogHeader><DialogTitle>{form.id ? "명함 수정" : "명함 등록"}</DialogTitle><DialogDescription>명함 이미지를 올리면 한글과 영문을 인식해 연락처 항목을 자동으로 채웁니다.</DialogDescription></DialogHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <Label htmlFor="business-card-image">명함 이미지</Label>
          <label htmlFor="business-card-image" className="flex aspect-[1.65/1] cursor-pointer items-center justify-center overflow-hidden border border-dashed bg-muted/30 text-center hover:bg-muted/50">
            {previewUrl ? <img src={previewUrl} alt="명함 원본 미리보기" className="h-full w-full object-contain" /> : <span className="space-y-2 text-sm text-muted-foreground"><Camera className="mx-auto h-8 w-8" /><span className="block">JPG, PNG, WEBP · 최대 10MB</span><span className="block">클릭하여 명함 이미지 선택</span></span>}
          </label>
          <Input id="business-card-image" className="h-auto cursor-pointer py-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runOcr(file); event.target.value = ""; }} />
          {(recognizing || ocrStatus) && <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{ocrStatus}</span><span>{ocrProgress}%</span></div><Progress value={ocrProgress} /></div>}
          {imageFile && !recognizing && <Button variant="outline" className="w-full" onClick={() => void runOcr(imageFile)}><RotateCcw className="mr-2 h-4 w-4" />다시 인식</Button>}
          <div className="space-y-1.5"><Label htmlFor="card-rawText">OCR 원문</Label><Textarea id="card-rawText" rows={8} value={form.rawText} onChange={(event) => setForm((current) => ({ ...current, rawText: event.target.value }))} placeholder="추출된 원문이 표시됩니다." /></div>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {field("name", "이름", "홍길동")}{field("company", "회사·기관", "주식회사 제주주차")}{field("department", "부서", "시설사업팀")}{field("position", "직책", "팀장")}
          {field("mobile", "휴대전화", "010-0000-0000", "tel")}{field("phone", "대표·사무실 전화", "064-000-0000", "tel")}{field("fax", "팩스", "064-000-0000", "tel")}{field("email", "이메일", "name@example.com", "email")}
          {field("website", "웹사이트", "www.example.com", "url")}<div className="space-y-1.5"><Label htmlFor="card-tags">업무 태그</Label><Input id="card-tags" value={form.tagsText} onChange={(event) => setForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="시설, 유지보수, 계약 (쉼표 구분)" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="card-address">주소</Label><Input id="card-address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="card-memo">업무 메모</Label><Textarea id="card-memo" rows={3} value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} placeholder="담당 업무, 소개 경위, 연락 시 참고사항" /></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>취소</Button><Button onClick={() => saveMutation.mutate()} disabled={recognizing || saveMutation.isPending}>{saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{form.id ? "수정 저장" : "명함 저장"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(detailCard)} onOpenChange={(open) => { if (!open) { setDetailCard(null); if (searchParams.has("card")) setSearchParams({}, { replace: true }); } }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{detailCard?.name || "명함 상세"}</DialogTitle><DialogDescription>{detailCard?.company} {detailCard?.department} {detailCard?.position}</DialogDescription></DialogHeader>
      {detailCard && <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <div className="flex aspect-[1.65/1] items-center justify-center overflow-hidden border bg-muted/30">{detailImageUrl ? <img src={detailImageUrl} alt={`${detailCard.name} 명함`} className="h-full w-full object-contain" /> : <ContactRound className="h-12 w-12 text-muted-foreground" />}</div>
        <dl className="grid grid-cols-[105px_1fr] gap-x-3 gap-y-3 text-sm"><dt className="text-muted-foreground">회사·기관</dt><dd>{detailCard.company || "-"}</dd><dt className="text-muted-foreground">부서·직책</dt><dd>{[detailCard.department, detailCard.position].filter(Boolean).join(" · ") || "-"}</dd><dt className="text-muted-foreground">휴대전화</dt><dd>{detailCard.mobile ? <a className="text-primary hover:underline" href={`tel:${detailCard.mobile}`}><Phone className="mr-1 inline h-3.5 w-3.5" />{detailCard.mobile}</a> : "-"}</dd><dt className="text-muted-foreground">사무실</dt><dd>{detailCard.phone || "-"}</dd><dt className="text-muted-foreground">이메일</dt><dd>{detailCard.email ? <a className="text-primary hover:underline" href={`mailto:${detailCard.email}`}><Mail className="mr-1 inline h-3.5 w-3.5" />{detailCard.email}</a> : "-"}</dd><dt className="text-muted-foreground">주소</dt><dd>{detailCard.address || "-"}</dd><dt className="text-muted-foreground">태그</dt><dd className="flex flex-wrap gap-1">{detailCard.tags.length ? detailCard.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>) : "-"}</dd><dt className="text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap">{detailCard.memo || "-"}</dd></dl>
      </div>}<DialogFooter><Button variant="outline" onClick={() => detailCard && setDeleteCard(detailCard)}><Trash2 className="mr-2 h-4 w-4" />삭제</Button><Button onClick={() => detailCard && void openEdit(detailCard)}><Pencil className="mr-2 h-4 w-4" />수정</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(deleteCard)} onOpenChange={(open) => { if (!open) setDeleteCard(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>명함을 삭제하시겠습니까?</DialogTitle><DialogDescription>{deleteCard?.name}의 명함이 목록과 전체 찾기에서 제외됩니다.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteCard(null)}>취소</Button><Button variant="destructive" onClick={() => deleteCard && deleteMutation.mutate(deleteCard)} disabled={deleteMutation.isPending}>삭제</Button></DialogFooter></DialogContent></Dialog>
  </DashboardLayout>;
}
