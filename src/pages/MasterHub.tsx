import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Wrench, DollarSign, BarChart3, FileText, Users, MapPin, Radio, Megaphone, Gavel, Briefcase, Lock, LayoutGrid } from "lucide-react";

const MODULES = [
  { code: 'SURVEY', label: '현황조사', icon: ClipboardCheck, url: '/master/surveys', countKey: 'surveys' },
  { code: 'OPS', label: '운영관리', icon: Users, url: '/master/ops', countKey: 'ops' },
  { code: 'FACILITY', label: '시설관리', icon: Wrench, url: '/master/facility', countKey: 'facility' },
  { code: 'REVENUE', label: '수입관리', icon: DollarSign, url: '/master/revenue', countKey: 'revenue' },
  { code: 'BUDGET', label: '예산관리', icon: BarChart3, url: '/master/budget', countKey: 'budget' },
  { code: 'PROCUREMENT', label: '입찰관리', icon: Gavel, url: '/master/procurement', countKey: 'procurement' },
  { code: 'SERVICE', label: '용역사업', icon: Briefcase, url: '/master/service', countKey: 'service' },
  { code: 'COMPLAINT', label: '민원관리', icon: Megaphone, url: '/master/complaints', countKey: 'complaint' },
  { code: 'PLANNING', label: '신설기획', icon: MapPin, url: '/master/planning', countKey: 'planning' },
  { code: 'REALTIME', label: '실시간정보', icon: Radio, url: '/master/realtime', countKey: 'realtime' },
  { code: 'REPORT', label: '보고서', icon: FileText, url: '/master/reports', countKey: 'report' },
];

export default function MasterHub() {
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const activeSet = new Set((licenses ?? []).filter(m => m.is_active).map(m => m.module_code));

  const { data: counts = {} } = useQuery({
    queryKey: ['master-hub-counts'], queryFn: async () => {
      const c: Record<string, string> = {};
      const [lots, surveys, equip, complaints, bids, services] = await Promise.all([
        supabase.from('parking_lots').select('*', { count: 'exact', head: true }),
        supabase.from('surveys').select('*', { count: 'exact', head: true }),
        supabase.from('equipment').select('*', { count: 'exact', head: true }),
        supabase.from('complaints').select('*', { count: 'exact', head: true }).not('status', 'in', '("closed","responded")'),
        supabase.from('bid_projects').select('*', { count: 'exact', head: true }).not('status', 'in', '("contracted","cancelled")'),
        supabase.from('service_projects').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      ]);
      c.surveys = `조사 ${surveys.count || 0}건`;
      c.ops = `주차장 ${lots.count || 0}개소`;
      c.facility = `장비 ${equip.count || 0}대`;
      c.complaint = `미처리 ${complaints.count || 0}건`;
      c.procurement = `진행중 ${bids.count || 0}건`;
      c.service = `진행중 ${services.count || 0}건`;
      c.revenue = '수입 현황';
      c.budget = '예산 현황';
      c.planning = '기획 현황';
      c.realtime = '실시간 현황';
      c.report = '보고서 현황';
      return c;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><LayoutGrid className="h-5 w-5" />종합 현황 센터</h1>
          <p className="text-sm text-muted-foreground">모든 모듈의 데이터를 한눈에 조회하고 엑셀/PDF로 내보냅니다</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map(m => {
            const active = activeSet.has(m.code) || m.code === 'SURVEY';
            const Icon = m.icon;
            return (
              <Card key={m.code} className={!active ? 'opacity-50' : 'hover:shadow-md transition-shadow'}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${active ? 'bg-primary/10' : 'bg-muted'}`}>
                      {active ? <Icon className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{m.label}</h3>
                      <p className="text-xs text-muted-foreground">{counts[m.countKey] || ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" disabled={!active} onClick={() => navigate(m.url)}>종합 조회</Button>
                  </div>
                  {!active && <Badge variant="outline" className="mt-2 text-[10px]">모듈 비활성</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
