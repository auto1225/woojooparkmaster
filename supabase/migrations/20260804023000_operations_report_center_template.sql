-- Dedicated central-report template for the operations report builder.
-- Keep RPT-MONTHLY as the existing cross-domain monthly summary.
INSERT INTO public.report_templates (
  template_code,
  name,
  report_type,
  report_category,
  target_audience,
  required_modules,
  is_system,
  is_active,
  is_favorite,
  sort_order,
  description,
  parameters,
  sections
) VALUES (
  'RPT-OPS-STATUS',
  '운영관리 현황 보고서',
  'monthly',
  'operation',
  'internal',
  '["CORE", "OPS", "REPORT"]'::jsonb,
  true,
  true,
  true,
  1,
  '주차장 운영업무의 기간별 현황과 조치대상을 선택해 PDF와 HWPX로 생성하는 공무원 업무 보고서',
  '[{"name":"period","label":"보고기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"운영 요약","type":"summary"},{"title":"선택 업무별 현황","type":"table"},{"title":"조치 필요사항","type":"text"}]'::jsonb
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
