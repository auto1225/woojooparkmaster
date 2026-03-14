import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClipboardCheck, Send, Check, Eye, FileText, Wallet, Briefcase, Gavel, ClipboardList, Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatManWon } from "@/lib/validators";

interface ApprovalItem {
  id: string;
  module: string;
  table: string;
  title: string;
  subtitle?: string;
  requester?: string;
  requestDate: string;
  amount?: number;
  status: string;
  link: string;
}

const MODULE_META: Record<string, { label: string; icon: any; color: string }> = {
  SURVEY: { label: "조사", icon: ClipboardList, color: "border-l-blue-500" },
  BUDGET: { label: "예산", icon: Wallet, color: "border-l-green-500" },
  PROCUREMENT: { label: "입찰", icon: Gavel, color: "border-l-purple-500" },
  SERVICE: { label: "용역", icon: Briefcase, color: "border-l-orange-500" },
  COMPLAINT: { label: "민원", icon: Megaphone, color: "border-l-red-500" },
};

export default function Approvals() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; items: ApprovalItem[] }>({ open: false, items: [] });
  const [moduleFilter, setModuleFilter] = useState("all");

  const activeModules = new Set((licenses ?? []).filter((m) => m.is_active).map((m) => m.module_code));

  // Fetch pending approvals
  const { data: pendingItems = [], isLoading } = useQuery({
    queryKey: ["approvals-pending", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const items: ApprovalItem[] = [];

      // SURVEY
      if (activeModules.has("SURVEY")) {
        const { data } = await supabase
          .from("surveys")
          .select("id, parking_lots(lot_name), surveyor_name, survey_date, submitted_at, status")
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false });
        data?.forEach((s: any) => {
          items.push({
            id: s.id, module: "SURVEY", table: "surveys",
            title: s.parking_lots?.lot_name || "주차장",
            subtitle: `조사자: ${s.surveyor_name || "-"}`,
            requestDate: s.submitted_at || s.survey_date,
            status: "submitted", link: `/surveys/${s.id}/review`,
          });
        });
      }

      // BUDGET executions
      if (activeModules.has("BUDGET")) {
        const { data } = await supabase
          .from("budget_executions")
          .select("id, description, vendor_name, amount, execution_date, status")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        data?.forEach((e: any) => {
          items.push({
            id: e.id, module: "BUDGET", table: "budget_executions",
            title: e.description, subtitle: `거래처: ${e.vendor_name || "-"}`,
            amount: e.amount, requestDate: e.execution_date,
            status: "pending", link: "/budget/executions",
          });
        });

        // Budget transfers
        const { data: transfers } = await supabase
          .from("budget_transfers")
          .select("id, transfer_type, reason, amount, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        transfers?.forEach((t: any) => {
          items.push({
            id: t.id, module: "BUDGET", table: "budget_transfers",
            title: `예산 ${t.transfer_type === 'transfer' ? '전용' : '이체'}`,
            subtitle: t.reason, amount: t.amount,
            requestDate: t.created_at, status: "pending",
            link: "/budget/transfers",
          });
        });
      }

      // PROCUREMENT
      if (activeModules.has("PROCUREMENT")) {
        const { data } = await supabase
          .from("bid_projects")
          .select("id, title, bid_type, estimated_amount, status, created_at")
          .eq("status", "review")
          .order("created_at", { ascending: false });
        data?.forEach((p: any) => {
          items.push({
            id: p.id, module: "PROCUREMENT", table: "bid_projects",
            title: p.title, subtitle: `방식: ${p.bid_type}`,
            amount: p.estimated_amount, requestDate: p.created_at,
            status: "review", link: `/procurement/projects/${p.id}`,
          });
        });
      }

      // SERVICE inspections
      if (activeModules.has("SERVICE")) {
        const { data: inspections } = await supabase
          .from("service_inspections")
          .select("id, service_projects(project_name), inspection_type, inspection_amount, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        inspections?.forEach((ins: any) => {
          items.push({
            id: ins.id, module: "SERVICE", table: "service_inspections",
            title: ins.service_projects?.project_name || "용역사업",
            subtitle: `검수 유형: ${ins.inspection_type}`,
            amount: ins.inspection_amount, requestDate: ins.created_at,
            status: "pending", link: `/service/projects/${ins.service_project_id}`,
          });
        });

        const { data: payments } = await supabase
          .from("service_payments")
          .select("id, service_projects(project_name), payment_type, amount, status, created_at")
          .in("status", ["requested", "approved"])
          .order("created_at", { ascending: false });
        payments?.forEach((p: any) => {
          items.push({
            id: p.id, module: "SERVICE", table: "service_payments",
            title: p.service_projects?.project_name || "용역사업",
            subtitle: `지급 유형: ${p.payment_type}`,
            amount: p.amount, requestDate: p.created_at,
            status: p.status, link: `/service/projects/${p.service_project_id}`,
          });
        });
      }

      // Sort by date desc
      items.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
      return items;
    },
    enabled: !!user,
  });

  // My requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["approvals-my-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const items: ApprovalItem[] = [];

      if (activeModules.has("SURVEY")) {
        const { data } = await supabase
          .from("surveys")
          .select("id, parking_lots(lot_name), status, submitted_at")
          .eq("created_by", user.id)
          .in("status", ["submitted", "approved", "rejected"])
          .order("submitted_at", { ascending: false });
        data?.forEach((s: any) => {
          items.push({
            id: s.id, module: "SURVEY", table: "surveys",
            title: s.parking_lots?.lot_name || "주차장",
            requestDate: s.submitted_at || "", status: s.status,
            link: `/surveys/${s.id}/review`,
          });
        });
      }

      if (activeModules.has("BUDGET")) {
        const { data } = await supabase
          .from("budget_executions")
          .select("id, description, amount, status, created_at")
          .eq("created_by", user.id)
          .in("status", ["pending", "approved", "rejected"])
          .order("created_at", { ascending: false });
        data?.forEach((e: any) => {
          items.push({
            id: e.id, module: "BUDGET", table: "budget_executions",
            title: e.description, amount: e.amount,
            requestDate: e.created_at, status: e.status,
            link: "/budget/executions",
          });
        });
      }

      items.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
      return items;
    },
    enabled: !!user,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (items: ApprovalItem[]) => {
      for (const item of items) {
        const newStatus = item.table === "surveys" ? "approved" : "approved";
        const updateData: Record<string, any> = { status: newStatus };
        if (item.table === "budget_executions" || item.table === "budget_transfers") {
          updateData.approved_by = user?.id;
          updateData.approved_at = new Date().toISOString();
        }
        const { error } = await (supabase.from(item.table as any) as any).update(updateData).eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-my-requests"] });
      toast.success("승인 완료");
      setSelected(new Set());
      setConfirmDialog({ open: false, items: [] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredPending = moduleFilter === "all" ? pendingItems : pendingItems.filter((i) => i.module === moduleFilter);
  const pendingCount = pendingItems.length;
  const myRequestCount = myRequests.filter((r) => r.status === "pending" || r.status === "submitted").length;

  const handleBulkApprove = () => {
    const items = filteredPending.filter((i) => selected.has(i.id));
    const modules = new Set(items.map((i) => i.module));
    if (modules.size > 1) {
      toast.error("같은 유형의 항목만 일괄 승인할 수 있습니다");
      return;
    }
    setConfirmDialog({ open: true, items });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
      pending: { label: "대기", variant: "secondary" },
      submitted: { label: "대기", variant: "secondary" },
      approved: { label: "승인", variant: "default" },
      rejected: { label: "반려", variant: "destructive" },
      review: { label: "검토", variant: "outline" },
      requested: { label: "요청", variant: "secondary" },
    };
    const m = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">통합 결재함</h1>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">내 결재 대기</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">내가 요청한 결재</p>
                <p className="text-2xl font-bold">{myRequestCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">결재 대기 ({pendingCount})</TabsTrigger>
            <TabsTrigger value="my">내 요청 ({myRequests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-4">
            {/* Module filter */}
            <div className="flex gap-2 flex-wrap">
              <Button variant={moduleFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setModuleFilter("all")}>전체</Button>
              {Object.entries(MODULE_META).filter(([k]) => activeModules.has(k)).map(([k, v]) => (
                <Button key={k} variant={moduleFilter === k ? "default" : "outline"} size="sm" onClick={() => setModuleFilter(k)}>
                  {v.label} ({pendingItems.filter((i) => i.module === k).length})
                </Button>
              ))}
            </div>

            {selected.size > 0 && (
              <Button size="sm" onClick={handleBulkApprove}>
                <Check className="h-4 w-4 mr-1" />선택 항목 일괄 승인 ({selected.size}건)
              </Button>
            )}

            <div className="space-y-3">
              {filteredPending.map((item) => {
                const meta = MODULE_META[item.module] || { label: item.module, icon: FileText, color: "border-l-gray-400" };
                const Icon = meta.icon;
                return (
                  <Card key={`${item.table}-${item.id}`} className={`border-l-4 ${meta.color}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          c ? next.add(item.id) : next.delete(item.id);
                          setSelected(next);
                        }}
                      />
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.requestDate ? new Date(item.requestDate).toLocaleDateString("ko-KR") : "-"}
                        </p>
                      </div>
                      {item.amount && (
                        <span className="text-sm font-semibold whitespace-nowrap">{formatManWon(item.amount)}</span>
                      )}
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="default" onClick={() => setConfirmDialog({ open: true, items: [item] })}>승인</Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(item.link)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredPending.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">결재 대기 건이 없습니다</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my" className="space-y-3 mt-4">
            {myRequests.map((item) => {
              const meta = MODULE_META[item.module] || { label: item.module, icon: FileText, color: "border-l-gray-400" };
              const Icon = meta.icon;
              return (
                <Card key={`${item.table}-${item.id}`} className={`border-l-4 ${meta.color}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.requestDate ? new Date(item.requestDate).toLocaleDateString("ko-KR") : "-"}
                      </p>
                    </div>
                    {item.amount && <span className="text-sm font-semibold">{formatManWon(item.amount)}</span>}
                    {statusBadge(item.status)}
                    <Button size="sm" variant="outline" onClick={() => navigate(item.link)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {myRequests.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">요청한 결재 건이 없습니다</div>
            )}
          </TabsContent>
        </Tabs>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog({ ...confirmDialog, open: o })}>
          <DialogContent>
            <DialogHeader><DialogTitle>승인 확인</DialogTitle></DialogHeader>
            <p className="text-sm">{confirmDialog.items.length}건을 승인하시겠습니까?</p>
            <ul className="text-xs text-muted-foreground space-y-1 mt-2 max-h-40 overflow-auto">
              {confirmDialog.items.map((i) => (
                <li key={i.id}>• {i.title} {i.amount ? `(${formatManWon(i.amount)})` : ""}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog({ open: false, items: [] })}>취소</Button>
              <Button onClick={() => approveMutation.mutate(confirmDialog.items)} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? "처리 중..." : "승인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
