
-- report_templates
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  report_type VARCHAR(30) NOT NULL,
  report_category VARCHAR(30) DEFAULT 'operation',
  target_audience VARCHAR(50),
  required_modules JSONB DEFAULT '["CORE"]',
  data_sources JSONB,
  parameters JSONB,
  template_format VARCHAR(10) DEFAULT 'pdf',
  template_path TEXT,
  template_html TEXT,
  page_orientation VARCHAR(10) DEFAULT 'portrait',
  page_size VARCHAR(5) DEFAULT 'A4',
  header_config JSONB,
  footer_config JSONB,
  sections JSONB,
  is_system BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- report_generated
CREATE TABLE report_generated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number VARCHAR(30) UNIQUE NOT NULL,
  template_id UUID NOT NULL REFERENCES report_templates(id),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  period_type VARCHAR(20),
  period_start DATE,
  period_end DATE,
  target_lots JSONB,
  parameters_used JSONB,
  file_path TEXT,
  file_format VARCHAR(10),
  file_size BIGINT,
  page_count INTEGER,
  excel_path TEXT,
  hwp_path TEXT,
  data_snapshot JSONB,
  summary_data JSONB,
  status VARCHAR(20) DEFAULT 'generating',
  error_message TEXT,
  generation_time_ms INTEGER,
  is_shared BOOLEAN DEFAULT false,
  shared_with JSONB,
  shared_at TIMESTAMPTZ,
  generated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- report_schedules
CREATE TABLE report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_name VARCHAR(200) NOT NULL,
  template_id UUID NOT NULL REFERENCES report_templates(id),
  frequency VARCHAR(20) NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  month_of_year INTEGER,
  execution_time TIME DEFAULT '06:00',
  target_lots JSONB,
  parameters JSONB,
  recipients JSONB NOT NULL,
  send_method VARCHAR(20) DEFAULT 'notification',
  email_subject VARCHAR(200),
  email_body TEXT,
  output_format VARCHAR(10) DEFAULT 'pdf',
  include_excel BOOLEAN DEFAULT false,
  last_run TIMESTAMPTZ,
  last_status VARCHAR(20),
  last_report_id UUID REFERENCES report_generated(id),
  next_run TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  consecutive_fails INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- dashboard_widgets
CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dashboard_name VARCHAR(100) DEFAULT 'default',
  widget_type VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(200),
  data_source VARCHAR(50) NOT NULL,
  data_config JSONB NOT NULL,
  chart_type VARCHAR(30),
  chart_config JSONB,
  display_config JSONB,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 4,
  height INTEGER DEFAULT 3,
  lot_filter JSONB,
  period_filter JSONB,
  is_visible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_templates_type ON report_templates(report_type, report_category);
CREATE INDEX idx_templates_system ON report_templates(is_system);
CREATE INDEX idx_generated_template ON report_generated(template_id, created_at DESC);
CREATE INDEX idx_generated_status ON report_generated(status);
CREATE INDEX idx_generated_period ON report_generated(period_start, period_end);
CREATE INDEX idx_generated_user ON report_generated(generated_by, created_at DESC);
CREATE INDEX idx_schedules_active ON report_schedules(is_active, next_run);
CREATE INDEX idx_schedules_template ON report_schedules(template_id);
CREATE INDEX idx_widgets_user ON dashboard_widgets(user_id, dashboard_name, sort_order);

-- Triggers
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_widgets_updated BEFORE UPDATE ON dashboard_widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_generated ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tmpl_select" ON report_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tmpl_modify" ON report_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "gen_select" ON report_generated FOR SELECT USING (
  generated_by = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);
CREATE POLICY "gen_insert" ON report_generated FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "gen_update" ON report_generated FOR UPDATE USING (
  generated_by = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "sched_select" ON report_schedules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sched_modify" ON report_schedules FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "widget_own" ON dashboard_widgets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "widget_insert" ON dashboard_widgets FOR INSERT WITH CHECK (user_id = auth.uid());

-- Seed: system report templates
INSERT INTO report_templates (template_code, name, report_type, report_category, target_audience, required_modules, is_system, sort_order, description, parameters, sections) VALUES
  ('RPT-DAILY', '일일 운영 보고서', 'daily', 'operation', 'internal',
   '["CORE"]', true, 1, '주차장 일일 운영 현황 요약',
   '[{"name":"date","label":"보고일","type":"date","required":true}]',
   '[{"title":"개요","type":"summary"},{"title":"주차장별 현황","type":"table"},{"title":"특이사항","type":"text"}]'),
  ('RPT-WEEKLY', '주간 운영 보고서', 'weekly', 'operation', 'internal',
   '["CORE"]', true, 2, '주간 운영 현황 및 주요 이슈',
   '[{"name":"week_start","label":"주 시작일","type":"date","required":true}]',
   '[{"title":"주간 요약","type":"summary"},{"title":"일별 현황","type":"chart","chart_type":"bar"},{"title":"주요 이슈","type":"text"}]'),
  ('RPT-MONTHLY', '월간 운영 보고서', 'monthly', 'operation', 'internal',
   '["CORE","OPS"]', true, 3, '월간 운영 현황, 수입, 민원 종합',
   '[{"name":"month","label":"보고 월","type":"month","required":true}]',
   '[{"title":"월간 요약","type":"summary"},{"title":"운영 현황","type":"table"},{"title":"수입 현황","type":"chart"},{"title":"민원 현황","type":"table"},{"title":"시설 현황","type":"table"}]'),
  ('RPT-QUARTERLY', '분기 실적 보고서', 'quarterly', 'comprehensive', 'mayor',
   '["CORE","OPS","REVENUE"]', true, 4, '분기별 종합 실적 (시장 보고용)',
   '[{"name":"quarter","label":"분기","type":"quarter","required":true}]',
   '[{"title":"분기 종합 요약","type":"summary"},{"title":"수입 분석","type":"chart"},{"title":"운영 실적","type":"table"},{"title":"시설 현황","type":"table"},{"title":"주요 성과","type":"text"},{"title":"개선 과제","type":"text"}]'),
  ('RPT-YEARLY', '연간 결산 보고서', 'yearly', 'comprehensive', 'council',
   '["CORE","OPS","REVENUE","BUDGET"]', true, 5, '연간 결산 종합 (시의회 제출용)',
   '[{"name":"year","label":"회계연도","type":"year","required":true}]',
   '[{"title":"연간 종합","type":"summary"},{"title":"세입세출","type":"table"},{"title":"주차장별 실적","type":"table"},{"title":"연도별 추이","type":"chart"},{"title":"향후 계획","type":"text"}]'),
  ('RPT-COUNCIL', '시의회 보고 자료', 'council', 'comprehensive', 'council',
   '["CORE","OPS","REVENUE","BUDGET"]', true, 6, '시의회 행정사무감사/예결산 보고용',
   '[{"name":"period","label":"보고기간","type":"daterange","required":true}]',
   '[{"title":"현황 요약","type":"summary"},{"title":"예산 집행","type":"table"},{"title":"수입 현황","type":"chart"},{"title":"주요 사업","type":"table"},{"title":"민원 현황","type":"table"},{"title":"질의 응답","type":"text"}]'),
  ('RPT-REVENUE', '수입 분석 보고서', 'monthly', 'revenue', 'internal',
   '["CORE","REVENUE"]', true, 10, '주차수입 상세 분석',
   '[{"name":"period","label":"분석기간","type":"daterange","required":true}]',
   '[{"title":"수입 요약","type":"summary"},{"title":"결제수단별","type":"chart","chart_type":"pie"},{"title":"주차장별","type":"chart","chart_type":"bar"},{"title":"일별 추이","type":"chart","chart_type":"line"},{"title":"전기대비","type":"table"}]'),
  ('RPT-FACILITY', '시설 점검 보고서', 'monthly', 'facility', 'internal',
   '["CORE","FACILITY"]', true, 11, '시설물 점검/유지보수 현황',
   '[{"name":"month","label":"보고 월","type":"month","required":true}]',
   '[{"title":"장비 현황","type":"summary"},{"title":"유지보수 실적","type":"table"},{"title":"안전점검 결과","type":"table"},{"title":"비용 분석","type":"chart"}]'),
  ('RPT-COMPLAINT', '민원 분석 보고서', 'monthly', 'complaint', 'internal',
   '["CORE","COMPLAINT"]', true, 12, '민원 접수/처리 현황 분석',
   '[{"name":"month","label":"보고 월","type":"month","required":true}]',
   '[{"title":"민원 요약","type":"summary"},{"title":"유형별 분포","type":"chart","chart_type":"pie"},{"title":"주차장별 현황","type":"table"},{"title":"처리 실적","type":"table"},{"title":"핫스팟 분석","type":"table"}]'),
  ('RPT-SURVEY', '현황조사 결과 보고서', 'custom', 'operation', 'internal',
   '["CORE","SURVEY"]', true, 13, '현황조사 결과 종합',
   '[{"name":"survey_ids","label":"조사 선택","type":"multi_select","required":true}]',
   '[{"title":"조사 개요","type":"summary"},{"title":"주차장별 결과","type":"table"},{"title":"사진 대장","type":"photos"},{"title":"센서 설치 계획","type":"table"},{"title":"종합 의견","type":"text"}]'),
  ('RPT-REALTIME', '실시간 운영 리포트', 'daily', 'realtime', 'internal',
   '["CORE","REALTIME"]', true, 14, '실시간 주차 데이터 일간 분석',
   '[{"name":"date","label":"분석일","type":"date","required":true}]',
   '[{"title":"일간 요약","type":"summary"},{"title":"시간대별 점유","type":"chart","chart_type":"area"},{"title":"주차장별 이용률","type":"table"},{"title":"센서 상태","type":"table"}]'),
  ('RPT-BUDGET', '예산 집행 현황', 'monthly', 'budget', 'internal',
   '["CORE","BUDGET"]', true, 15, '예산 편성/집행 현황',
   '[{"name":"month","label":"보고 월","type":"month","required":true}]',
   '[{"title":"집행 요약","type":"summary"},{"title":"세입세출","type":"table"},{"title":"항목별 집행률","type":"chart","chart_type":"bar"},{"title":"월별 추이","type":"chart","chart_type":"line"}]');

-- Activate REPORT module
UPDATE module_licenses SET is_active = true, activated_at = now() WHERE module_code = 'REPORT';
