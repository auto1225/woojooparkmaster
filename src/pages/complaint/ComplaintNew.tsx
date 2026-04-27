import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
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
import { ArrowLeft, AlertTriangle, Sparkles } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { callAI } from "@/lib/ai-service";

export default function ComplaintNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const { data: config } = useSystemConfig();
  const aiEnabled = config?.ai_enabled === 'true';

  const [form, setForm] = useState({
    channel: "phone", category: "", sub_category: "", priority: "normal",
    title: "", content: "", location_detail: "", incident_date: "", incident_time: "",
    vehicle_number: "", complainant_name: "", complainant_phone: "", complainant_email: "",
    complainant_address: "", is_anonymous: false, lot_id: "", assigned_team: "", assigned_to: "",
    saeol_ref: "", privacy_agreed: false, author_name: "",
  });

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("name");
      return data || [];
    },
  });

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
    if (!form.is_anonymous && !form.privacy_agreed) {
      toast({ title: "개인정보 수집 동의가 필요합니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const complaint_number = generateNumber();
      const status = form.assigned_to ? "assigned" : "received";
      const insertData: any = {
        complaint_number,
        channel: form.channel, category: form.category, sub_category: form.sub_category || null,
        priority: form.priority, title: form.title, content: form.content,
        location_detail: form.location_detail || null,
        incident_date: form.incident_date || null, incident_time: form.incident_time || null,
        vehicle_number: form.vehicle_number || null,
        complainant_name: form.is_anonymous ? null : form.complainant_name || null,
        complainant_phone: form.is_anonymous ? null : form.complainant_phone || null,
        complainant_email: form.is_anonymous ? null : form.complainant_email || null,
        complainant_address: form.is_anonymous ? null : form.complainant_address || null,
        is_anonymous: form.is_anonymous,
        lot_id: form.lot_id || null,
        assigned_team: (form.assigned_team || null) as any,
        assigned_to: form.assigned_to || null,
        assigned_at: form.assigned_to ? new Date().toISOString() : null,
        saeol_ref: form.saeol_ref || null,
        status,
        created_by: profile?.id,
        author_name: form.author_name || profile?.name || null,
      };

      const { data, error } = await supabase.from("complaints").insert(insertData).select().single();
      if (error) throw error;

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

      toast({ title: "민원이 접수되었습니다", description: complaint_number });

      if (continueAdding) {
        setForm({
          channel: "phone", category: "", sub_category: "", priority: "normal",
          title: "", content: "", location_detail: "", incident_date: "", incident_time: "",
          vehicle_number: "", complainant_name: "", complainant_phone: "", complainant_email: "",
          complainant_address: "", is_anonymous: false, lot_id: "", assigned_team: "", assigned_to: "",
          saeol_ref: "", privacy_agreed: false, author_name: "",
        });
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

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/complaints")}><ArrowLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-bold">민원 접수</h2>
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
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">세부유형</Label>
                    <Input value={form.sub_category} onChange={e => update("sub_category", e.target.value)} className="h-9 text-sm" placeholder="선택사항" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">관련 주차장</Label>
                  <Select value={form.lot_id} onValueChange={v => update("lot_id", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">민원 내용</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">제목 *</Label>
                  <Input value={form.title} onChange={e => update("title", e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">내용 *</Label>
                  <Textarea value={form.content} onChange={e => update("content", e.target.value)} rows={5} className="text-sm" />
                  {aiEnabled && form.content.length > 10 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="text-xs gap-1" disabled={aiClassifying}
                        onClick={async () => {
                          setAiClassifying(true);
                          try {
                            const result = await callAI({ task: 'classify_complaint', input: { title: form.title, content: form.content } });
                            if (result.category) update("category", result.category);
                            if (result.sub_category) update("sub_category", result.sub_category);
                            if (result.priority) update("priority", result.priority);
                            if (result.assigned_team) update("assigned_team", result.assigned_team);
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
                      {aiKeywords.length > 0 && (
                        <div className="flex gap-1 mt-1">{aiKeywords.map(k => <Badge key={k} variant="secondary" className="text-[9px]">{k}</Badge>)}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">사건 발생일</Label>
                    <Input type="date" value={form.incident_date} onChange={e => update("incident_date", e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">위치 상세</Label>
                    <Input value={form.location_detail} onChange={e => update("location_detail", e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">관련 차량번호</Label>
                  <Input value={form.vehicle_number} onChange={e => update("vehicle_number", e.target.value)} className="h-9 text-sm w-48" />
                </div>
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
                      <Checkbox checked={form.privacy_agreed} onCheckedChange={v => update("privacy_agreed", !!v)} className="mt-0.5" />
                      <div>
                        <span className="text-xs font-medium">개인정보 수집·이용에 동의합니다. (필수)</span>
                        <a href="/privacy" target="_blank" className="text-[10px] text-primary ml-1 hover:underline">자세히 보기</a>
                        <p className="text-[10px] text-muted-foreground mt-1">수집 항목: 이름, 전화번호, 이메일 | 보유 기간: 처리 완료 후 3년</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_anonymous} onCheckedChange={v => update("is_anonymous", v)} />
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
                <div>
                  <Label className="text-xs">이메일</Label>
                  <Input disabled={form.is_anonymous} value={form.complainant_email} onChange={e => update("complainant_email", e.target.value)} className="h-9 text-sm" />
                </div>
              </CardContent>
            </Card>

            <Card>
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
            </Card>
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
