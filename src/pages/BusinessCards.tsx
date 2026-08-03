import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { recognize } from "tesseract.js";
import {
  Archive, ArrowDownAZ, BriefcaseBusiness, Building2, Camera, Check, ContactRound,
  Download, ExternalLink, Loader2, Mail, Pencil, Phone, Plus, RotateCcw, Search,
  ShieldCheck, Upload,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  archiveBusinessCard, DuplicateBusinessCardError, getBusinessCardImageUrl,
  listBusinessCardLinkOptions, listBusinessCards, matchesBusinessCard, restoreBusinessCard,
  saveBusinessCard, suggestBusinessCardLinks, type BusinessCard, type BusinessCardInput,
  type BusinessCardLink, type BusinessCardLinkOption,
} from "@/lib/business-card-registry";
import { businessCardCompleteness, inferBusinessCardProfile, parseBusinessCardText } from "@/lib/business-card-ocr";
import type { LotType } from "@/types/database";
import { toast } from "sonner";

const CATEGORY_LABELS = {
  facility: "시설·유지보수", service: "용역", operations: "운영", procurement: "조달·입찰",
  complaint: "민원 협력", public: "공공기관", other: "기타",
} as const;
const LOT_LABELS: Record<LotType, string> = { offstreet: "노외주차장", multilevel: "주차빌딩", onstreet: "노상주차장" };
const CHANNEL_LABELS = { mobile: "휴대전화", office: "사무실 전화", email: "이메일" } as const;
const SOURCE_LABELS = { business_card: "명함", manual: "직접 입력", email_signature: "이메일 서명", official_document: "공문", other: "기타" } as const;

type CardForm = BusinessCardInput & { tagsText: string; linkKeys: string[] };

function emptyForm(): CardForm {
  return {
    id: "", rowVersion: 1, name: "", company: "", department: "", position: "", mobile: "", phone: "", fax: "",
    email: "", website: "", address: "", rawText: "", memo: "", tags: [], tagsText: "", imagePath: "", imageName: "",
    businessCategory: "other", lotTypes: ["offstreet", "multilevel", "onstreet"], preferredChannel: "mobile",
    emergencyContact: false, collectionSource: "business_card", businessPurpose: "공영주차장 업무 연락",
    lastVerifiedAt: new Date().toISOString().slice(0, 10), retentionReviewDate: "", ocrCompleteness: 0,
    retainOcrText: false, links: [], linkKeys: [],
  };
}

function formFromCard(card: BusinessCard): CardForm {
  return { ...card, tagsText: card.tags.join(", "), linkKeys: card.links.map((link) => `${link.module}:${link.recordId}`) };
}

function linkFromOption(option: BusinessCardLinkOption): BusinessCardLink {
  return {
    module: option.module, recordId: option.recordId, recordLabel: option.recordLabel, recordPath: option.recordPath,
    companyName: option.companyName, relationType: option.relationType, lotId: option.lotId,
    lotName: option.lotName, lotType: option.lotType,
  };
}

function downloadVCard(card: BusinessCard) {
  const content = [
    "BEGIN:VCARD", "VERSION:3.0", `FN:${card.name}`, `ORG:${card.company};${card.department}`, `TITLE:${card.position}`,
    card.mobile && `TEL;TYPE=CELL:${card.mobile}`, card.phone && `TEL;TYPE=WORK:${card.phone}`,
    card.email && `EMAIL;TYPE=WORK:${card.email}`, card.website && `URL:${card.website}`, card.address && `ADR;TYPE=WORK:;;${card.address}`,
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/vcard;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${card.company || "연락처"}-${card.name || card.cardNumber}.vcf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BusinessCards() {
  const { profile } = useAuth();
  const canManage = ["admin", "manager", "editor"].includes(profile?.role || "");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [lotType, setLotType] = useState("all");
  const [verification, setVerification] = useState("all");
  const [sort, setSort] = useState("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [archiveView, setArchiveView] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [detailCard, setDetailCard] = useState<BusinessCard | null>(null);
  const [archiveCard, setArchiveCard] = useState<BusinessCard | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [duplicate, setDuplicate] = useState<BusinessCard | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detailImageUrl, setDetailImageUrl] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [recognizing, setRecognizing] = useState(false);

  const { data: cards = [], isLoading } = useQuery({ queryKey: ["business-cards", archiveView], queryFn: () => listBusinessCards(archiveView) });
  const { data: linkOptions = [] } = useQuery({ queryKey: ["business-card-link-options"], queryFn: listBusinessCardLinkOptions, enabled: formOpen && canManage, retry: false });

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
    if (detailCard?.imagePath) getBusinessCardImageUrl(detailCard.imagePath, detailCard.id).then((url) => active && setDetailImageUrl(url)).catch(() => undefined);
    return () => { active = false; };
  }, [detailCard]);

  const suggestedKeys = useMemo(() => new Set(suggestBusinessCardLinks(form, linkOptions).map((option) => option.key)), [form, linkOptions]);
  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = cards.filter((card) => {
      if (query.trim() && !matchesBusinessCard(card, query)) return false;
      if (category !== "all" && card.businessCategory !== category) return false;
      if (lotType !== "all" && !card.lotTypes.includes(lotType as LotType)) return false;
      if (verification === "due" && card.lastVerifiedAt && card.lastVerifiedAt >= today) return false;
      if (verification === "unlinked" && card.links.length) return false;
      if (verification === "emergency" && !card.emergencyContact) return false;
      return true;
    });
    const value = (card: BusinessCard) => {
      if (sort === "name") return card.name;
      if (sort === "company") return `${card.company}${card.name}`;
      if (sort === "verified") return card.lastVerifiedAt || "";
      if (sort === "category") return `${card.businessCategory}${card.company}${card.name}`;
      if (sort === "created") return card.createdAt;
      return card.updatedAt;
    };
    return [...rows].sort((a, b) => direction === "asc" ? value(a).localeCompare(value(b), "ko") : value(b).localeCompare(value(a), "ko"));
  }, [cards, category, direction, lotType, query, sort, verification]);

  const saveMutation = useMutation({
    mutationFn: () => saveBusinessCard({
      ...form,
      tags: form.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      links: linkOptions.filter((option) => form.linkKeys.includes(option.key)).map(linkFromOption),
      clientRequestId: form.id ? undefined : crypto.randomUUID(),
    }, imageFile),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["business-cards"] });
      setFormOpen(false);
      setDuplicate(null);
      toast.success(form.id ? "명함 정보를 수정했습니다." : `${saved.cardNumber} 명함을 등록했습니다.`);
    },
    onError: (error: Error) => {
      if (error instanceof DuplicateBusinessCardError) setDuplicate(error.duplicate);
      else toast.error(error.message);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveBusinessCard(archiveCard!, archiveReason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-cards"] });
      setArchiveCard(null); setArchiveReason(""); setDetailCard(null); toast.success("명함을 보관했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreBusinessCard,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["business-cards"] }); setDetailCard(null); toast.success("명함을 활성 연락망으로 복원했습니다."); },
    onError: (error: Error) => error instanceof DuplicateBusinessCardError ? setDuplicate(error.duplicate) : toast.error(error.message),
  });

  const resetEditor = () => {
    setForm(emptyForm()); setImageFile(null); setPreviewUrl(""); setOcrProgress(0); setOcrStatus(""); setRecognizing(false);
  };
  const openNew = () => { resetEditor(); setFormOpen(true); };
  const openEdit = async (card: BusinessCard) => {
    setDetailCard(null); setImageFile(null); setOcrProgress(0); setOcrStatus(""); setForm(formFromCard(card));
    setPreviewUrl(card.imagePath ? await getBusinessCardImageUrl(card.imagePath, card.id).catch(() => "") : "");
    setFormOpen(true);
  };
  const applyParsedText = (rawText: string) => {
    const parsed = parseBusinessCardText(rawText);
    const inferred = inferBusinessCardProfile(rawText);
    setForm((current) => ({
      ...current, ...parsed, id: current.id, rowVersion: current.rowVersion, memo: current.memo,
      tagsText: [...new Set([...current.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean), ...inferred.tags])].join(", "),
      imagePath: current.imagePath, imageName: current.imageName, businessCategory: inferred.businessCategory,
      lotTypes: inferred.lotTypes, ocrCompleteness: businessCardCompleteness(parsed), links: current.links, linkKeys: current.linkKeys,
    }));
    setOcrStatus(`자동 정리 완료 · 주요 항목 ${businessCardCompleteness(parsed)}% 인식`);
  };
  const runOcr = async (file: File) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return toast.error("JPG, PNG, WEBP 이미지를 선택해 주세요.");
    if (file.size > 10 * 1024 * 1024) return toast.error("이미지는 10MB 이하만 등록할 수 있습니다.");
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); setRecognizing(true); setOcrProgress(1); setOcrStatus("문자 인식 준비 중");
    try {
      const result = await recognize(file, "kor+eng", { logger: (message) => {
        if (typeof message.progress === "number") setOcrProgress(Math.max(1, Math.round(message.progress * 100)));
        setOcrStatus(message.status === "recognizing text" ? "명함 문자 인식 중" : "인식 엔진 준비 중");
      } });
      applyParsedText(result.data.text);
      setForm((current) => ({ ...current, imageName: file.name }));
      setOcrProgress(100); toast.success("명함 텍스트를 추출해 항목별로 정리했습니다.");
    } catch (error) {
      setOcrStatus("자동 인식 실패"); toast.error(error instanceof Error ? error.message : "명함을 인식하지 못했습니다.");
    } finally { setRecognizing(false); }
  };
  const toggleLotType = (value: LotType, checked: boolean) => setForm((current) => ({ ...current, lotTypes: checked ? [...new Set([...current.lotTypes, value])] : current.lotTypes.filter((item) => item !== value) }));
  const toggleLink = (key: string, checked: boolean) => setForm((current) => ({ ...current, linkKeys: checked ? [...new Set([...current.linkKeys, key])] : current.linkKeys.filter((item) => item !== key) }));
  const field = (key: keyof CardForm, label: string, placeholder = "", type = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`card-${key}`}>{label}</Label><Input id={`card-${key}`} type={type} value={String(form[key] || "")} placeholder={placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>
  );

  return <DashboardLayout>
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold">명함관리</h1><p className="mt-1 text-sm text-muted-foreground">시설·용역·공공기관 담당자를 업무자료와 연결해 관리합니다.</p></div>
        {canManage && <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />명함 등록</Button>}
      </header>

      <section className="grid grid-cols-2 border-y bg-background md:grid-cols-5">
        {[
          ["활성 연락망", cards.length], ["관련 회사", new Set(cards.map((card) => card.company).filter(Boolean)).size],
          ["업무 연결", cards.filter((card) => card.links.length).length], ["긴급 연락", cards.filter((card) => card.emergencyContact).length],
          ["확인 필요", cards.filter((card) => !card.lastVerifiedAt || card.lastVerifiedAt < new Date().toISOString().slice(0, 10)).length],
        ].map(([label, value], index) => <div className={`${index ? "border-l" : ""} px-4 py-3`} key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}건</p></div>)}
      </section>

      <section className="space-y-2 border-b pb-4">
        <div className="flex flex-col gap-2 xl:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 회사, 전화, 이메일, 연결 업무 찾기" /></div>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full xl:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 업무분야</SelectItem>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={lotType} onValueChange={setLotType}><SelectTrigger className="w-full xl:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={verification} onValueChange={setVerification}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="due">연락처 확인 필요</SelectItem><SelectItem value="unlinked">업무 미연결</SelectItem><SelectItem value="emergency">긴급 연락처</SelectItem></SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="updated">최근 수정일</SelectItem><SelectItem value="created">등록일</SelectItem><SelectItem value="verified">확인일</SelectItem><SelectItem value="company">회사·이름</SelectItem><SelectItem value="name">이름</SelectItem><SelectItem value="category">업무분야</SelectItem></SelectContent></Select>
          <Button variant="outline" size="icon" title={direction === "asc" ? "오름차순" : "내림차순"} onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")}><ArrowDownAZ className={`h-4 w-4 ${direction === "desc" ? "rotate-180" : ""}`} /></Button>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">검색 결과 {filtered.length}건</span>{canManage && <label className="flex items-center gap-2"><Switch checked={archiveView} onCheckedChange={setArchiveView} />보관함</label>}</div>
      </section>

      <div className="hidden overflow-hidden border bg-background md:block">
        <Table><TableHeader><TableRow><TableHead>관리번호·담당자</TableHead><TableHead>회사·업무분야</TableHead><TableHead>연락처</TableHead><TableHead>적용 주차장</TableHead><TableHead>연결 업무</TableHead><TableHead>확인일</TableHead><TableHead className="w-20 text-right">관리</TableHead></TableRow></TableHeader>
          <TableBody>{isLoading ? <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground">조건에 맞는 명함이 없습니다.</TableCell></TableRow> : filtered.map((card) => <TableRow key={card.id} className="cursor-pointer" onClick={() => setDetailCard(card)}>
            <TableCell><p className="font-medium">{card.name || "이름 미확인"} <span className="text-xs font-normal text-muted-foreground">{card.position}</span></p><p className="text-xs text-muted-foreground">{card.cardNumber}</p></TableCell>
            <TableCell><p>{card.company || "-"}</p><Badge variant="outline" className="mt-1">{CATEGORY_LABELS[card.businessCategory]}</Badge></TableCell>
            <TableCell><p>{card.mobile || card.phone || "-"}</p><p className="text-xs text-muted-foreground">{card.email}</p></TableCell>
            <TableCell><div className="flex max-w-56 flex-wrap gap-1">{card.lotTypes.map((item) => <Badge variant="secondary" key={item}>{LOT_LABELS[item]}</Badge>)}</div></TableCell>
            <TableCell>{card.links.length ? `${card.links.length}건` : <span className="text-muted-foreground">미연결</span>}</TableCell><TableCell>{card.lastVerifiedAt || "확인 필요"}</TableCell>
            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>{archiveView ? <Button variant="ghost" size="sm" onClick={() => restoreMutation.mutate(card)}>복원</Button> : canManage && <Button variant="ghost" size="icon" title="명함 수정" onClick={() => void openEdit(card)}><Pencil className="h-4 w-4" /></Button>}</TableCell>
          </TableRow>)}</TableBody></Table>
      </div>

      <div className="grid gap-3 md:hidden">{filtered.map((card) => <article key={card.id} className="border bg-background p-4" onClick={() => setDetailCard(card)}>
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{card.name || "이름 미확인"} <span className="text-sm font-normal text-muted-foreground">{card.position}</span></p><p className="mt-1 text-sm">{card.company || "회사 미등록"} · {card.department || "부서 미등록"}</p></div>{card.emergencyContact && <Badge variant="destructive">긴급</Badge>}</div>
        <div className="mt-3 flex flex-wrap gap-1">{card.lotTypes.map((item) => <Badge variant="secondary" key={item}>{LOT_LABELS[item]}</Badge>)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" asChild onClick={(event) => event.stopPropagation()}><a href={`tel:${card.mobile || card.phone}`}><Phone className="mr-2 h-4 w-4" />전화</a></Button><Button variant="outline" asChild disabled={!card.email} onClick={(event) => event.stopPropagation()}><a href={`mailto:${card.email}`}><Mail className="mr-2 h-4 w-4" />메일</a></Button></div>
      </article>)}</div>
    </div>

    <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetEditor(); }}><DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
      <DialogHeader><DialogTitle>{form.id ? "명함 수정" : "명함 등록"}</DialogTitle><DialogDescription>사진을 촬영하거나 OCR 원문을 붙여넣으면 연락처와 업무분야를 자동 정리합니다.</DialogDescription></DialogHeader>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section className="space-y-3">
          <Label htmlFor="business-card-image">명함 이미지</Label>
          <label htmlFor="business-card-image" className="flex aspect-[1.65/1] cursor-pointer items-center justify-center overflow-hidden border border-dashed bg-muted/30 text-center">
            {previewUrl ? <img src={previewUrl} alt="명함 원본 미리보기" className="h-full w-full object-contain" /> : <span className="space-y-2 text-sm text-muted-foreground"><Camera className="mx-auto h-8 w-8" /><span className="block">촬영 또는 이미지 선택</span><span className="block">JPG, PNG, WEBP · 최대 10MB</span></span>}
          </label>
          <Input id="business-card-image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runOcr(file); event.target.value = ""; }} />
          {(recognizing || ocrStatus) && <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{ocrStatus}</span><span>{ocrProgress}%</span></div><Progress value={ocrProgress} /></div>}
          {imageFile && !recognizing && <Button variant="outline" className="w-full" onClick={() => void runOcr(imageFile)}><RotateCcw className="mr-2 h-4 w-4" />이미지 다시 인식</Button>}
          <Label htmlFor="card-rawText">OCR 원문</Label><Textarea id="card-rawText" rows={7} value={form.rawText} onChange={(event) => setForm((current) => ({ ...current, rawText: event.target.value }))} placeholder="인식 결과를 붙여넣거나 직접 수정할 수 있습니다." />
          <Button variant="outline" className="w-full" disabled={!form.rawText.trim()} onClick={() => applyParsedText(form.rawText)}><ShieldCheck className="mr-2 h-4 w-4" />OCR 원문 자동 정리</Button>
        </section>
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">{field("name", "이름", "홍길동")}{field("company", "회사·기관", "주식회사 제주시설")}{field("department", "부서", "시설사업팀")}{field("position", "직책", "팀장")}{field("mobile", "휴대전화", "010-0000-0000", "tel")}{field("phone", "사무실 전화", "064-000-0000", "tel")}{field("email", "이메일", "name@example.com", "email")}{field("website", "웹사이트", "www.example.com", "url")}</div>
          <div className="space-y-2"><Label>적용 주차장 형태</Label><div className="flex flex-wrap gap-4">{Object.entries(LOT_LABELS).map(([value, label]) => <label className="flex items-center gap-2" key={value}><Checkbox checked={form.lotTypes.includes(value as LotType)} onCheckedChange={(checked) => toggleLotType(value as LotType, Boolean(checked))} />{label}</label>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>업무분야</Label><Select value={form.businessCategory} onValueChange={(value: CardForm["businessCategory"]) => setForm((current) => ({ ...current, businessCategory: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>{field("businessPurpose", "이용 목적", "공영주차장 시설 유지보수 연락")}</div>
          <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-semibold">추가 정보와 행정 관리</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{field("fax", "팩스", "064-000-0000", "tel")}{field("address", "주소")}{field("tagsText", "업무 태그", "시설, 유지보수")}
            <div className="space-y-1.5"><Label>선호 연락수단</Label><Select value={form.preferredChannel} onValueChange={(value: CardForm["preferredChannel"]) => setForm((current) => ({ ...current, preferredChannel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CHANNEL_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>수집 경로</Label><Select value={form.collectionSource} onValueChange={(value: CardForm["collectionSource"]) => setForm((current) => ({ ...current, collectionSource: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SOURCE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            {field("lastVerifiedAt", "연락처 확인일", "", "date")}{field("retentionReviewDate", "보유 검토일", "", "date")}
            <div className="flex items-center justify-between gap-3"><Label>긴급 연락처</Label><Switch checked={form.emergencyContact} onCheckedChange={(checked) => setForm((current) => ({ ...current, emergencyContact: checked }))} /></div>
            <div className="flex items-center justify-between gap-3"><Label>OCR 원문 보관</Label><Switch checked={form.retainOcrText} onCheckedChange={(checked) => setForm((current) => ({ ...current, retainOcrText: checked }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>업무 메모</Label><Textarea rows={3} value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} /></div>
          </div></details>
          <details className="border-t pt-4" open={Boolean(suggestedKeys.size)}><summary className="cursor-pointer text-sm font-semibold">관련 업무 연결 ({form.linkKeys.length}건)</summary><div className="mt-3 max-h-56 space-y-2 overflow-y-auto border p-2">{linkOptions.length ? linkOptions.map((option) => <label className={`flex cursor-pointer gap-3 p-2 text-sm ${suggestedKeys.has(option.key) ? "bg-primary/5" : ""}`} key={option.key}><Checkbox checked={form.linkKeys.includes(option.key)} onCheckedChange={(checked) => toggleLink(option.key, Boolean(checked))} /><span className="min-w-0"><span className="block font-medium">{option.recordLabel}</span><span className="block text-xs text-muted-foreground">{option.companyName || "기관 미등록"}{suggestedKeys.has(option.key) ? " · 자동 추천" : ""}</span></span></label>) : <p className="p-3 text-sm text-muted-foreground">연결 가능한 시설·용역·문서를 불러오지 못했거나 없습니다.</p>}</div></details>
        </section>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>취소</Button><Button onClick={() => saveMutation.mutate()} disabled={recognizing || saveMutation.isPending}>{saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{form.id ? "수정 저장" : "명함 저장"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(detailCard)} onOpenChange={(open) => { if (!open) { setDetailCard(null); if (searchParams.has("card")) setSearchParams({}, { replace: true }); } }}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{detailCard?.name || "명함 상세"}</DialogTitle><DialogDescription>{detailCard?.cardNumber} · {detailCard?.company}</DialogDescription></DialogHeader>
      {detailCard && <div className="space-y-5"><div className="grid gap-5 md:grid-cols-[250px_1fr]"><div className="flex aspect-[1.65/1] items-center justify-center overflow-hidden border bg-muted/30">{detailImageUrl ? <img src={detailImageUrl} alt={`${detailCard.name} 명함`} className="h-full w-full object-contain" /> : <ContactRound className="h-12 w-12 text-muted-foreground" />}</div><dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-3 text-sm"><dt className="text-muted-foreground">부서·직책</dt><dd>{[detailCard.department, detailCard.position].filter(Boolean).join(" · ") || "-"}</dd><dt className="text-muted-foreground">휴대전화</dt><dd><a className="text-primary" href={`tel:${detailCard.mobile}`}>{detailCard.mobile || "-"}</a></dd><dt className="text-muted-foreground">사무실</dt><dd>{detailCard.phone || "-"}</dd><dt className="text-muted-foreground">이메일</dt><dd><a className="break-all text-primary" href={`mailto:${detailCard.email}`}>{detailCard.email || "-"}</a></dd><dt className="text-muted-foreground">업무분야</dt><dd>{CATEGORY_LABELS[detailCard.businessCategory]}</dd><dt className="text-muted-foreground">확인일</dt><dd>{detailCard.lastVerifiedAt || "미확인"}</dd></dl></div>
        <section className="border-t pt-4"><h3 className="text-sm font-semibold">연결 업무</h3>{detailCard.links.length ? <div className="mt-2 divide-y border">{detailCard.links.map((link) => <Link className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50" key={`${link.module}:${link.recordId}`} to={link.recordPath}><span>{link.recordLabel}</span><ExternalLink className="h-4 w-4" /></Link>)}</div> : <p className="mt-2 text-sm text-muted-foreground">연결된 시설·용역·문서가 없습니다.</p>}</section>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Button variant="outline" asChild><a href={`tel:${detailCard.mobile || detailCard.phone}`}><Phone className="mr-2 h-4 w-4" />전화</a></Button><Button variant="outline" asChild><a href={`mailto:${detailCard.email}`}><Mail className="mr-2 h-4 w-4" />메일</a></Button><Button variant="outline" onClick={() => downloadVCard(detailCard)}><Download className="mr-2 h-4 w-4" />연락처 저장</Button><Button variant="outline" onClick={() => navigate(`/team-work?new=1&tab=work_order&title=${encodeURIComponent(`[${detailCard.company}] ${detailCard.name} 연락 업무`)}&category=${encodeURIComponent("대외협력")}&nextAction=${encodeURIComponent(detailCard.businessPurpose)}&parkingLotType=${detailCard.lotTypes[0]}`)}><BriefcaseBusiness className="mr-2 h-4 w-4" />업무 생성</Button></div>
      </div>}
      <DialogFooter>{detailCard?.archivedAt ? <Button onClick={() => detailCard && restoreMutation.mutate(detailCard)} disabled={restoreMutation.isPending}><RotateCcw className="mr-2 h-4 w-4" />복원</Button> : canManage && <><Button variant="outline" onClick={() => detailCard && setArchiveCard(detailCard)}><Archive className="mr-2 h-4 w-4" />보관</Button><Button onClick={() => detailCard && void openEdit(detailCard)}><Pencil className="mr-2 h-4 w-4" />수정</Button></>}</DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(archiveCard)} onOpenChange={(open) => !open && setArchiveCard(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>명함을 보관하시겠습니까?</DialogTitle><DialogDescription>삭제하지 않고 보관함으로 이동하여 감사이력과 업무 연결을 유지합니다.</DialogDescription></DialogHeader><Label htmlFor="archive-reason">보관 사유</Label><Textarea id="archive-reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="퇴사, 담당자 변경, 계약 종료 등" /><DialogFooter><Button variant="outline" onClick={() => setArchiveCard(null)}>취소</Button><Button onClick={() => archiveMutation.mutate()} disabled={!archiveReason.trim() || archiveMutation.isPending}><Archive className="mr-2 h-4 w-4" />보관</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(duplicate)} onOpenChange={(open) => !open && setDuplicate(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>중복 연락처가 있습니다</DialogTitle><DialogDescription>{duplicate?.company} {duplicate?.name}의 휴대전화 또는 이메일이 같습니다. 새로 만들지 않고 기존 명함을 확인하거나 병합할 수 있습니다.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { if (duplicate) setDetailCard(cards.find((card) => card.id === duplicate.id) || duplicate); setDuplicate(null); setFormOpen(false); }}><ExternalLink className="mr-2 h-4 w-4" />기존 명함 열기</Button>{canManage && duplicate && !duplicate.archivedAt && <Button onClick={() => { const existing = cards.find((card) => card.id === duplicate.id) || duplicate; setForm((current) => ({ ...current, id: existing.id, rowVersion: existing.rowVersion, imagePath: existing.imagePath || current.imagePath, links: existing.links, linkKeys: existing.links.map((link) => `${link.module}:${link.recordId}`) })); setDuplicate(null); }}><Check className="mr-2 h-4 w-4" />기존 명함에 병합</Button>}</DialogFooter></DialogContent></Dialog>
  </DashboardLayout>;
}
