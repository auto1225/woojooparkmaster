import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { CHANNEL_LABELS, CATEGORY_LABELS, PRIORITY_LABELS, getTeamRecommendation } from "@/types/complaint";
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI, reviewAIAssistance, type AIResult } from "@/lib/ai-service";
import { runtimeConfig } from "@/config/runtime-config";
import { buildParkingLocationDetail, getComplaintRule, getParkingLotWorkProfile, getRecommendedDueDate } from "@/lib/parking-lot-work-profile";
import { createComplaintFacilityWork } from "@/lib/complaint-facility-work";

export default function ComplaintNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<AIResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: config } = useSystemConfig();
  const aiEnabled = runtimeConfig.externalAiEnabled && config?.ai_enabled === 'true';

  const [form, setForm] = useState({
    channel: "phone", category: "", sub_category: "", priority: "normal",
    title: "", content: "", location_detail: "", incident_date: "", incident_time: "",
    vehicle_number: "", complainant_name: "", complainant_phone: "", complainant_email: "",
    complainant_address: "", is_anonymous: false, lot_id: "", assigned_team: "", assigned_to: "",
    saeol_ref: "", external_ref: "", due_date: "", is_repeat: false,
    related_complaint_id: "", repeat_count: 0, privacy_agreed: false, author_name: "",
  });
  const [locationParts, setLocationParts] = useState({ primary: "", secondary: "", space: "" });

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-select", "with-type"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("name");
      return data || [];
    },
  });
  const selectedLot = useMemo(() => lots?.find((lot) => lot.id === form.lot_id), [form.lot_id, lots]);
  const selectedProfile = useMemo(() => getParkingLotWorkProfile(selectedLot?.lot_type), [selectedLot?.lot_type]);
  const selectedRule = useMemo(() => getComplaintRule(selectedLot?.lot_type, form.sub_category), [form.sub_category, selectedLot?.lot_type]);

  const { data: staffList } = useQuery({
    queryKey: ["staff-for-assignment", form.assigned_team],
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, name, team").eq("is_active", true);
      if (form.assigned_team) q = q.eq("team", form.assigned_team as "operations" | "facilities" | "admin" | "planning");
      const { data } = await q.order("name");
      // Get open complaint counts
      if (data?.length) {
        const { data: counts } = await supabase.from("complaints")
          .select("assigned_to")
          .not("status", "in", '("closed","responded")')
          .not("assigned_to", "is", null);
        const countMap: Record<string, number> = {};
        counts?.forEach(c => { countMap[c.assigned_to!] = (countMap[c.assigned_to!] || 0) + 1; });
        return data.map(s => ({ ...s, openCount: countMap[s.id] || 0 }));
      }
      return [];
    },
  });

  const { data: relatedCandidates = [] } = useQuery({
    queryKey: ["complaint-new-related", form.lot_id],
    queryFn: async () => {
      let query = supabase.from("complaints")
        .select("id, complaint_number, title, repeat_count, received_at")
        .order("received_at", { ascending: false }).limit(100);
      if (form.lot_id) query = query.eq("lot_id", form.lot_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: form.is_repeat,
  });

  useEffect(() => {
    if (form.category) {
      const rec = getTeamRecommendation(form.category);
      if (rec) setForm(f => ({ ...f, assigned_team: rec }));
    }
  }, [form.category]);

  const generateNumber = () => {
    const d = new Date();
    const prefix = `CM-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${prefix}-${String(Math.floor(Math.random() * 900) + 100)}`;
  };

  const handleSubmit = async (continueAdding = false) => {
    if (!form.title || !form.content || !form.category) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (form.lot_id && !form.sub_category) {
      toast({ title: "주차장 형태에 맞는 세부유형을 선택해주세요", variant: "destructive" });
      return;
    }
    if (form.lot_id && !Object.values(locationParts).some((value) => value.trim()) && !form.location_detail.trim()) {
      toast({ title: "현장 확인이 가능하도록 위치를 입력해주세요", variant: "destructive" });
      return;
    }
    if (!form.is_anonymous && !form.privacy_agreed) {
      toast({ title: "개인정보 수집 동의가 필요합니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (form.saeol_ref) {
        const { data: duplicate } = await supabase.from("complaints").select("complaint_number").eq("saeol_ref", form.saeol_ref).maybeSingle();
        if (duplicate) throw new Error(`이미 등록된 새올 연계번호입니다: ${duplicate.complaint_number}`);
      }
      if (form.external_ref) {
        const { data: duplicate } = await supabase.from("complaints").select("complaint_number").eq("external_ref", form.external_ref).maybeSingle();
        if (duplicate) throw new Error(`이미 등록된 외부 접수번호입니다: ${duplicate.complaint_number}`);
      }
      const complaint_number = generateNumber();
      const status = form.assigned_to ? "assigned" : "received";
      const structuredLocation = buildParkingLocationDetail(selectedLot?.lot_type, locationParts, form.location_detail);
      const insertData: any = {
        complaint_number,
        channel: form.channel, category: form.category, sub_category: form.sub_category || null,
        priority: form.priority, title: form.title, content: form.content,
        location_detail: structuredLocation || null,
        incident_date: form.incident_date || null, incident_time: form.incident_time || null,
        vehicle_number: form.vehicle_number || null,
        complainant_name: form.is_anonymous ? null : form.complainant_name || null,
        complainant_phone: form.is_anonymous ? null : form.complainant_phone || null,
        complainant_email: form.is_anonymous ? null : form.complainant_email || null,
        complainant_address: form.is_anonymous ? null : form.complainant_address || null,
        is_anonymous: form.is_anonymous,
        privacy_agreed_at: form.is_anonymous ? null : new Date().toISOString(),
        lot_id: form.lot_id || null,
        assigned_team: (form.assigned_team || null) as any,
        assigned_to: form.assigned_to || null,
        assigned_at: form.assigned_to ? new Date().toISOString() : null,
        saeol_ref: form.saeol_ref || null,
        external_ref: form.external_ref || null,
        due_date: form.due_date || null,
        is_repeat: form.is_repeat,
        related_complaint_id: form.is_repeat && form.related_complaint_id ? form.related_complaint_id : null,
        repeat_count: form.is_repeat ? Math.max(2, form.repeat_count || 0) : 0,
        status,
        created_by: profile?.id,
        author_name: form.author_name || profile?.name || null,
      };

      const { data, error } = await supabase.from("complaints").insert(insertData).select().single();
      if (error) throw error;

      if (profile?.id) {
        await supabase.from("complaint_comments").insert({
          complaint_id: data.id,
          author_id: profile.id,
          author_name: profile.name,
          content: `${complaint_number} 민원이 접수되었습니다.`,
          comment_type: "internal",
          is_system: true,
        });
      }

      let linkedWork: { id: string; log_number: string } | null = null;
      if (selectedRule?.createsMaintenanceWork && form.lot_id) {
        try {
          linkedWork = await createComplaintFacilityWork({
            complaintId: data.id,
            complaintNumber: complaint_number,
            lotId: form.lot_id,
            title: form.title,
            content: form.content,
            locationDetail: structuredLocation,
            dueDate: data.due_date || form.due_date || null,
            reporterId: profile?.id,
            rule: selectedRule,
          });
          if (linkedWork && profile?.id) {
            await supabase.from("complaint_comments").insert({
              complaint_id: data.id,
              author_id: profile.id,
              author_name: profile.name,
              content: `${linkedWork.log_number} 시설 작업이 자동 생성되었습니다.`,
              comment_type: "internal",
              is_system: true,
            });
          }
        } catch (workError: any) {
          toast({ title: "민원은 접수되었으나 시설 작업 생성에 실패했습니다", description: workError.message, variant: "destructive" });
        }
      }

      if (form.is_repeat && form.related_complaint_id) {
        await supabase.from("complaints").update({
          is_repeat: true,
          repeat_count: Math.max(2, form.repeat_count || 0),
        }).eq("id", form.related_complaint_id);
      }

      if (form.assigned_to) {
        await supabase.from("notifications").insert([{
          user_id: form.assigned_to,
          title: "민원 배정",
          message: `[${complaint_number}] ${form.title}`,
          link: `/complaints/${data.id}`,
          type: "complaint",
          module: "COMPLAINT",
        }]);
      }

      await logActivity({ module: "COMPLAINT", action: "접수", targetType: "complaint", targetId: data.id, targetName: complaint_number });

      toast({ title: "민원이 접수되었습니다", description: linkedWork ? `${complaint_number} · 시설작업 ${linkedWork.log_number}` : complaint_number });

      if (continueAdding) {
        setForm({
          channel: "phone", category: "", sub_category: "", priority: "normal",
          title: "", content: "", location_detail: "", incident_date: "", incident_time: "",
          vehicle_number: "", complainant_name: "", complainant_phone: "", complainant_email: "",
          complainant_address: "", is_anonymous: false, lot_id: "", assigned_team: "", assigned_to: "",
          saeol_ref: "", external_ref: "", due_date: "", is_repeat: false,
          related_complaint_id: "", repeat_count: 0, privacy_agreed: false, author_name: "",
        });
        setLocationParts({ primary: "", secondary: "", space: "" });
        setShowAdvanced(false);
      } else {
        navigate(`/complaints/${data.id}`);
      }
    } catch (e: any) {
      toast({ title: "접수 실패", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));
  const applyParkingSubtype = (value: string) => {
    const rule = getComplaintRule(selectedLot?.lot_type, value);
    setForm((current) => ({
      ...current,
      sub_category: value,
      category: rule?.category || current.category,
      assigned_team: rule?.assignedTeam || current.assigned_team,
      priority: rule?.priority || current.priority,
      due_date: rule ? getRecommendedDueDate(rule.dueDays) : current.due_date,
      assigned_to: rule && current.assigned_team !== rule.assignedTeam ? "" : current.assigned_to,
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/complaints")}><ArrowLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-bold">민원 접수</h2>
          <Badge variant="secondary" className="ml-auto">빠른 접수</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced}>
            {showAdvanced ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            {showAdvanced ? "추가정보 닫기" : "추가정보"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left column */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">접수 정보</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">접수 채널 *</Label>
                    <Select value={form.channel} onValueChange={v => update("channel", v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CHANNEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.channel === "saeol" && (
                    <div>
                      <Label className="text-xs">새올e 연계번호</Label>
                      <Input value={form.saeol_ref} onChange={e => update("saeol_ref", e.target.value)} className="h-9 text-sm" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">분류</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">유형 *</Label>
                    <Select value={form.category} onValueChange={v => update("category", v)}>
                      <SelectTrigger aria-label="민원 유형" className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">세부유형</Label>
                    {form.lot_id ? (
                      <Select value={form.sub_category} onValueChange={applyParkingSubtype}>
                        <SelectTrigger aria-label="주차장 형태별 세부유형" className="h-9 text-sm"><SelectValue placeholder="세부유형 선택" /></SelectTrigger>
                        <SelectContent>{selectedProfile.complaintRules.map((rule) => <SelectItem key={rule.value} value={rule.value}>{rule.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <Input value={form.sub_category} onChange={e => update("sub_category", e.target.value)} className="h-9 text-sm" placeholder="주차장 선택 시 표준 분류 제공" />}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">관련 주차장</Label>
                  <Select value={form.lot_id} onValueChange={v => {
                    setForm((current) => ({ ...current, lot_id: v, sub_category: "" }));
                    setLocationParts({ primary: "", secondary: "", space: "" });
                  }}>
                    <SelectTrigger aria-label="관련 주차장" className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.lot_id && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selectedProfile.label}</Badge><span className="text-xs font-medium">{selectedProfile.workFocus}</span></div>
                    {selectedRule && <p className="mt-2 text-xs text-muted-foreground">추천: {selectedRule.assignedTeam === "facilities" ? "시설관리팀" : "운영관리팀"} · {PRIORITY_LABELS[selectedRule.priority]} · {selectedRule.dueDays}일 이내{selectedRule.createsMaintenanceWork ? " · 접수 시 시설 작업 자동 생성" : ""}</p>}
                  </div>
                )}
                <div>
                  <Label className="text-xs">우선순위</Label>
                  <div className="flex gap-2 mt-1">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <Button key={k} type="button" size="sm" variant={form.priority === k ? "default" : "outline"}
                        className={`text-xs ${form.priority === k && k === "urgent" ? "bg-destructive text-destructive-foreground" : ""}`}
                        onClick={() => update("priority", k)}>{v}</Button>
                    ))}
                  </div>
                  {form.priority === "urgent" && (
                    <div className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
                      <AlertTriangle className="h-3.5 w-3.5" />긴급 민원은 1일 이내 처리해야 합니다
                    </div>
                  )}
                </div>
                {showAdvanced && <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">처리기한</Label>
                      <Input aria-label="처리기한" type="date" value={form.due_date} onChange={e => update("due_date", e.target.value)} className="h-9 text-sm" />
                      <p className="text-[10px] text-muted-foreground mt-1">미입력 시 우선순위에 따라 자동 산정됩니다.</p>
                    </div>
                    <div>
                      <Label className="text-xs">기타 외부 접수번호</Label>
                      <Input aria-label="기타 외부 접수번호" value={form.external_ref} onChange={e => update("external_ref", e.target.value)} className="h-9 text-sm" placeholder="국민신문고·전화민원 등" />
                    </div>
                  </div>
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="repeat-complaint" aria-label="반복민원" checked={form.is_repeat} onCheckedChange={value => update("is_repeat", !!value)} />
                      <Label htmlFor="repeat-complaint" className="text-xs">기존 민원과 같은 반복민원</Label>
                    </div>
                    {form.is_repeat && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <Label className="text-xs">원 민원번호</Label>
                          <Select value={form.related_complaint_id || "none"} onValueChange={value => {
                            update("related_complaint_id", value === "none" ? "" : value);
                            const selected = relatedCandidates.find(item => item.id === value);
                            if (selected) update("repeat_count", Math.max(2, (selected.repeat_count || 1) + 1));
                          }}>
                            <SelectTrigger aria-label="원 민원번호" className="h-9 text-sm"><SelectValue placeholder="기존 민원 선택" /></SelectTrigger>
                            <SelectContent><SelectItem value="none">원 민원 미지정</SelectItem>{relatedCandidates.map(item => <SelectItem key={item.id} value={item.id}>{item.complaint_number} · {item.title}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">누적 반복횟수</Label>
                          <Input type="number" min={2} value={form.repeat_count || 2} onChange={e => update("repeat_count", Number(e.target.value))} className="h-9 text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                </>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원 내용</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">제목 *</Label>
                  <Input aria-label="민원 제목" value={form.title} onChange={e => update("title", e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">내용 *</Label>
                  <Textarea aria-label="민원 내용" value={form.content} onChange={e => update("content", e.target.value)} rows={5} className="text-sm" />
                  {aiEnabled && form.content.length > 10 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="text-xs gap-1" disabled={aiClassifying}
                        onClick={async () => {
                          setAiClassifying(true);
                          try {
                            const result = await callAI({ task: 'classify_complaint', input: { title: form.title, content: form.content } });
                            setAiSuggestion(result);
                            if (result.summary) setAiSummary(result.summary);
                            if (result.keywords) setAiKeywords(result.keywords);
                            await logActivity({ module: 'ai', action: 'classify_complaint', details: { title: form.title } });
                            toast({ title: "AI 분류 완료" });
                          } catch (e: any) {
                            toast({ title: "AI 분류 실패", description: e.message, variant: "destructive" });
                          } finally { setAiClassifying(false); }
                        }}>
                        <Sparkles className="h-3 w-3" />{aiClassifying ? "분류 중..." : "AI 분류"}
                      </Button>
                      <span className="text-[10px] text-muted-foreground">AI가 민원을 분석하여 유형과 우선순위를 추천합니다</span>
                    </div>
                  )}
                  {aiSummary && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">AI 요약: {aiSummary}</p>
                      {aiSuggestion && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {aiSuggestion.category && <Badge variant="outline" className="text-[9px]">분류 {CATEGORY_LABELS[aiSuggestion.category] || aiSuggestion.category}</Badge>}
                          {aiSuggestion.priority && <Badge variant="outline" className="text-[9px]">우선순위 {PRIORITY_LABELS[aiSuggestion.priority] || aiSuggestion.priority}</Badge>}
                          {aiSuggestion.assigned_team && <Badge variant="outline" className="text-[9px]">담당 {aiSuggestion.assigned_team}</Badge>}
                          {aiSuggestion.confidence != null && <Badge variant="secondary" className="text-[9px]">신뢰도 {Math.round(aiSuggestion.confidence * 100)}%</Badge>}
                          {aiSuggestion.sources.slice(0, 3).map((source) => <Badge key={source.path} variant="secondary" className="text-[9px]">근거 {source.label}</Badge>)}
                        </div>
                      )}
                      {aiKeywords.length > 0 && (
                        <div className="flex gap-1 mt-1">{aiKeywords.map(k => <Badge key={k} variant="secondary" className="text-[9px]">{k}</Badge>)}</div>
                      )}
                      {aiSuggestion && (
                        <div className="flex gap-2 mt-2">
                          <Button type="button" size="sm" className="h-7 text-xs" onClick={async () => {
                            if (aiSuggestion.category) update("category", aiSuggestion.category);
                            if (aiSuggestion.sub_category) update("sub_category", aiSuggestion.sub_category);
                            if (aiSuggestion.priority) update("priority", aiSuggestion.priority);
                            if (aiSuggestion.assigned_team) update("assigned_team", aiSuggestion.assigned_team);
                            await reviewAIAssistance(aiSuggestion.assistanceId, { applied: true, targetType: "complaint_draft" });
                            toast({ title: "AI 추천을 적용했습니다. 제출 전 확인해 주세요" });
                          }}>추천 적용</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => {
                            await reviewAIAssistance(aiSuggestion.assistanceId, { applied: false });
                            setAiSuggestion(null);
                            setAiSummary(null);
                            setAiKeywords([]);
                          }}>추천 닫기</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {showAdvanced && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">사건 발생일</Label>
                    <Input type="date" value={form.incident_date} onChange={e => update("incident_date", e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>}
                {form.lot_id && (
                  <div className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2"><Label className="text-xs">{selectedProfile.label} 위치 *</Label><span className="text-[10px] text-muted-foreground">검색 가능한 표준 위치로 저장</span></div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      {selectedProfile.locationFields.map((field) => <div key={field.key}><Label className="text-[10px] text-muted-foreground">{field.label}</Label><Input value={locationParts[field.key]} onChange={(event) => setLocationParts((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="h-9 text-sm" /></div>)}
                    </div>
                  </div>
                )}
                {showAdvanced && <>
                  <div><Label className="text-xs">추가 위치 설명</Label><Input value={form.location_detail} onChange={e => update("location_detail", e.target.value)} className="h-9 text-sm" placeholder={form.lot_id ? "표준 위치를 입력할 수 없는 경우만 작성" : "상세 위치"} /></div>
                  <div>
                    <Label className="text-xs">관련 차량번호</Label>
                    <Input value={form.vehicle_number} onChange={e => update("vehicle_number", e.target.value)} className="h-9 text-sm w-48" />
                  </div>
                </>}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원인 정보</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {/* SEC-C-7: 개인정보 수집 동의 */}
                {!form.is_anonymous && (
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex items-start gap-2">
                       <Checkbox id="privacy-agreement" aria-label="개인정보 수집·이용 동의" checked={form.privacy_agreed} onCheckedChange={v => update("privacy_agreed", !!v)} className="mt-0.5" />
                       <div>
                         <Label htmlFor="privacy-agreement" className="text-xs font-medium">개인정보 수집·이용에 동의합니다. (필수)</Label>
                        <a href="/privacy" target="_blank" className="text-[10px] text-primary ml-1 hover:underline">자세히 보기</a>
                        <p className="text-[10px] text-muted-foreground mt-1">수집 항목: 이름, 전화번호, 이메일 | 보유 기간: 처리 완료 후 3년</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch aria-label="익명 민원" checked={form.is_anonymous} onCheckedChange={v => update("is_anonymous", v)} />
                  <Label className="text-xs">익명</Label>
                </div>
                <div>
                  <Label className="text-xs">이름</Label>
                  <Input disabled={form.is_anonymous} value={form.complainant_name} onChange={e => update("complainant_name", e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">연락처</Label>
                  <Input disabled={form.is_anonymous} value={form.complainant_phone} onChange={e => update("complainant_phone", e.target.value)} className="h-9 text-sm" />
                </div>
                {showAdvanced && <div>
                  <Label className="text-xs">이메일</Label>
                  <Input disabled={form.is_anonymous} value={form.complainant_email} onChange={e => update("complainant_email", e.target.value)} className="h-9 text-sm" />
                </div>}
              </CardContent>
            </Card>

            {showAdvanced && <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">담당자 배정</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">담당팀</Label>
                  <Select value={form.assigned_team} onValueChange={v => update("assigned_team", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operations">운영관리팀</SelectItem>
                      <SelectItem value="facilities">시설관리팀</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.category && getTeamRecommendation(form.category) && (
                    <p className="text-[10px] text-muted-foreground mt-1">자동 추천: {form.assigned_team === "operations" ? "운영관리팀" : "시설관리팀"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">담당자</Label>
                  <Select value={form.assigned_to} onValueChange={v => update("assigned_to", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {staffList?.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} {s.openCount > 0 && <Badge variant="secondary" className="ml-1 text-[9px]">{s.openCount}건</Badge>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <AuthorField value={form.author_name || ""} onChange={v => update("author_name", v)} />
              </CardContent>
            </Card>}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => navigate("/complaints")}>취소</Button>
          <Button variant="secondary" disabled={saving} onClick={() => handleSubmit(true)}>접수 후 계속 접수</Button>
          <Button disabled={saving} onClick={() => handleSubmit(false)}>{saving ? "저장 중..." : "접수"}</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
