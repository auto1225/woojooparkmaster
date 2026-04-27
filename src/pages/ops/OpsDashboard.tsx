import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, CreditCard, AlertTriangle, Shield } from "lucide-react";
import { VIOLATION_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, CONTRACT_STATUS_LABELS } from "@/types/operations";

export default function OpsDashboardPage() {
  const navigate = useNavigate();

  const { data: staff } = useQuery({ queryKey: ["ops-staff-count"], queryFn: async () => {
    const { count } = await supabase.from("operations_staff").select("*", { count: "exact", head: true }).eq("is_active", true);
    return count || 0;
  }});

  const { data: contracts } = useQuery({ queryKey: ["ops-contracts"], queryFn: async () => {
    const { data } = await supabase.from("outsourcing_contracts").select("*, parking_lots(code, name)").eq("status", "active");
    return data || [];
  }});

  const { data: passes } = useQuery({ queryKey: ["ops-passes-count"], queryFn: async () => {
    const { count } = await supabase.from("monthly_passes").select("*", { count: "exact", head: true }).eq("status", "active");
    return count || 0;
  }});

  const { data: enforcement } = useQuery({ queryKey: ["ops-enforcement-unpaid"], queryFn: async () => {
    const { data } = await supabase.from("enforcement_records").select("*, parking_lots(code, name)").in("payment_status", ["unpaid", "overdue"]).order("violation_date", { ascending: false }).limit(10);
    return data || [];
  }});

  const { data: expiringPasses } = useQuery({ queryKey: ["ops-expiring-passes"], queryFn: async () => {
    const d7 = new Date(); d7.setDate(d7.getDate() + 7);
    const { data } = await supabase.from("monthly_passes").select("*, parking_lots(name)").eq("status", "active").lte("pass_end", d7.toISOString().split("T")[0]).order("pass_end").limit(5);
    return data || [];
  }});

  const now = new Date();
  const d30 = new Date(); d30.setDate(d30.getDate() + 30);
  const expiringContracts = (contracts || []).filter((c: any) => new Date(c.contract_end) <= d30);
  const unpaidCount = enforcement?.length || 0;

  const kpis = [
    { label: "위탁 주차장", value: contracts?.length || 0, icon: Building2, color: "text-blue-500", onClick: () => navigate("/ops/contracts") },
    { label: "관리인력", value: staff || 0, icon: Users, color: "text-success", onClick: () => navigate("/ops/staff") },
    { label: "월정기권 발급", value: passes || 0, icon: CreditCard, color: "text-purple-500", onClick: () => navigate("/ops/passes") },
    { label: "계약 만료 임박", value: expiringContracts.length, icon: AlertTriangle, color: "text-orange-500", onClick: () => navigate("/ops/contracts?filter=expiring") },
    { label: "단속 미납", value: unpaidCount, icon: Shield, color: "text-destructive", onClick: () => navigate("/ops/enforcement") },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">운영 현황</h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <Card key={k.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={k.onClick}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">위탁계약 만료 임박</CardTitle></CardHeader>
            <CardContent>
              {expiringContracts.length === 0 ? <p className="text-sm text-muted-foreground">만료 임박 계약 없음</p> : (
                <div className="space-y-2">
                  {expiringContracts.slice(0, 5).map((c: any) => {
                    const dday = Math.ceil((new Date(c.contract_end).getTime() - now.getTime()) / 86400000);
                    return (
                      <div key={c.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-accent/50 p-1.5 rounded" onClick={() => navigate(`/ops/contracts`)}>
                        <div><span className="font-medium">{(c.parking_lots as any)?.name}</span><span className="text-muted-foreground ml-2">{c.company_name}</span></div>
                        <Badge variant="outline" className="text-orange-600 text-[10px]">D-{dday > 0 ? dday : 0}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">월정기권 만료 임박 (7일 이내)</CardTitle></CardHeader>
            <CardContent>
              {(expiringPasses || []).length === 0 ? <p className="text-sm text-muted-foreground">만료 임박 정기권 없음</p> : (
                <div className="space-y-2">
                  {(expiringPasses || []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <div><span className="font-bold">{p.vehicle_number}</span><span className="text-muted-foreground ml-2">{(p.parking_lots as any)?.name}</span></div>
                      <span className="text-xs text-muted-foreground">{p.pass_end}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">최근 단속 (미납/체납)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>일시</TableHead><TableHead>주차장</TableHead><TableHead>차량번호</TableHead>
                <TableHead>위반유형</TableHead><TableHead className="text-right">과태료</TableHead><TableHead>상태</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(enforcement || []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">단속 기록 없음</TableCell></TableRow>
                ) : (enforcement || []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{new Date(e.violation_date).toLocaleDateString("ko")}</TableCell>
                    <TableCell className="text-xs">{(e.parking_lots as any)?.name || "-"}</TableCell>
                    <TableCell className="text-sm font-bold">{e.vehicle_number}</TableCell>
                    <TableCell className="text-xs">{VIOLATION_TYPE_LABELS[e.violation_type] || e.violation_type}</TableCell>
                    <TableCell className="text-xs text-right">{e.fine_amount?.toLocaleString() || "-"}원</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_COLORS[e.payment_status] || ""}`}>{PAYMENT_STATUS_LABELS[e.payment_status]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
