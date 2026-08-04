-- Dedicated central report templates for procurement and service management.
INSERT INTO public.report_templates (
  template_code, name, report_type, report_category, target_audience,
  required_modules, is_system, is_active, is_favorite, sort_order,
  description, parameters, sections
) VALUES
(
  'RPT-PROCUREMENT',
  '입찰·계약 종합 현황 보고서',
  'monthly',
  'procurement',
  'internal',
  '["CORE", "PROCUREMENT", "REPORT"]'::jsonb,
  true, true, false, 50,
  '공고·개찰·평가·계약·보증·기한·업체·예산·낙찰률과 공식 문서번호를 선택해 HWPX와 PDF로 생성하는 입찰관리 보고서',
  '[{"name":"period","label":"보고기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"입찰 핵심지표","type":"summary"},{"title":"공고·개찰·평가","type":"table"},{"title":"계약·보증·기한","type":"table"},{"title":"위험·문서 근거","type":"table"}]'::jsonb
),
(
  'RPT-SERVICE',
  '용역사업 종합 현황 보고서',
  'monthly',
  'service',
  'internal',
  '["CORE", "SERVICE", "REPORT"]'::jsonb,
  true, true, false, 60,
  '용역 개요·계약·업체 담당자·착수·진도·검수·대금·성과물·하자와 공식 문서번호를 선택해 HWPX와 PDF로 생성하는 용역사업관리 보고서',
  '[{"name":"period","label":"보고기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"용역 핵심지표","type":"summary"},{"title":"계약·업체 연락처","type":"table"},{"title":"진도·검수·대금","type":"table"},{"title":"성과·하자·문서 근거","type":"table"}]'::jsonb
)
ON CONFLICT (template_code) DO UPDATE SET
  name = EXCLUDED.name,
  report_type = EXCLUDED.report_type,
  report_category = EXCLUDED.report_category,
  target_audience = EXCLUDED.target_audience,
  required_modules = EXCLUDED.required_modules,
  is_system = EXCLUDED.is_system,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  parameters = EXCLUDED.parameters,
  sections = EXCLUDED.sections;
