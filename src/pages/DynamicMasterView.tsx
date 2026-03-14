/**
 * 동적 마스터 뷰 페이지
 * ─────────────────────
 * URL 파라미터로 모듈 코드를 받아 중앙 설정(master-config)에서
 * 컬럼·쿼리·필터를 자동으로 로드합니다.
 * 설정 파일 하나만 수정하면 화면·엑셀·PDF에 즉시 반영됩니다.
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView } from "@/components/common/MasterDataView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModuleConfig, getModuleCodeFromPath } from "@/config/master-config";
import { EmptyState } from "@/components/common/EmptyState";
import { AlertCircle } from "lucide-react";

export default function DynamicMasterView() {
  const { moduleCode } = useParams<{ moduleCode: string }>();
  const navigate = useNavigate();
  const code = getModuleCodeFromPath(moduleCode || '') || moduleCode?.toUpperCase() || '';
  const config = getModuleConfig(code);

  if (!config) {
    return (
      <DashboardLayout>
        <EmptyState
          icon={AlertCircle}
          title="모듈을 찾을 수 없습니다"
          description={`'${moduleCode}' 모듈에 대한 마스터 설정이 없습니다.`}
        />
      </DashboardLayout>
    );
  }

  const hasTabs = config.tabs.length > 1;

  if (hasTabs) {
    return (
      <DashboardLayout>
        <MultiTabMaster config={config} navigate={navigate} />
      </DashboardLayout>
    );
  }

  // Single tab
  const tab = config.tabs[0];
  return (
    <DashboardLayout>
      <SingleTabMaster config={config} tab={tab} navigate={navigate} />
    </DashboardLayout>
  );
}

function SingleTabMaster({ config, tab, navigate }: { config: any; tab: any; navigate: any }) {
  const { data = [], isLoading } = useQuery<Record<string, any>[]>({
    queryKey: [tab.queryKey],
    queryFn: tab.queryFn,
  });

  return (
    <MasterDataView
      title={config.title}
      subtitle={config.subtitle}
      columns={tab.columns}
      data={data}
      loading={isLoading}
      frozenColumns={tab.frozenColumns ?? 3}
      exportFileName={tab.exportFileName}
      filterConfig={tab.filterConfig}
      onRowClick={tab.onRowClick ? (row: any) => navigate(tab.onRowClick!(row)) : undefined}
    />
  );
}

function MultiTabMaster({ config, navigate }: { config: any; navigate: any }) {
  const [activeTab, setActiveTab] = useState(config.tabs[0].key);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{config.title}</h1>
      {config.subtitle && <p className="text-sm text-muted-foreground">{config.subtitle}</p>}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {config.tabs.map((t: any) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {config.tabs.map((tab: any) => (
          <TabsContent key={tab.key} value={tab.key}>
            <TabContent tab={tab} navigate={navigate} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TabContent({ tab, navigate }: { tab: any; navigate: any }) {
  const { data = [], isLoading } = useQuery<Record<string, any>[]>({
    queryKey: [tab.queryKey],
    queryFn: tab.queryFn,
  });

  return (
    <MasterDataView
      title={tab.label + ' 종합'}
      columns={tab.columns}
      data={data}
      loading={isLoading}
      frozenColumns={tab.frozenColumns ?? 3}
      exportFileName={tab.exportFileName}
      filterConfig={tab.filterConfig}
      onRowClick={tab.onRowClick ? (row: any) => navigate(tab.onRowClick!(row)) : undefined}
    />
  );
}
