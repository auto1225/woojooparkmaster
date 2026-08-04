INSERT INTO public.report_templates (
  template_code, name, report_type, report_category, target_audience,
  required_modules, is_system, is_active, is_favorite, sort_order,
  description, parameters, sections
) VALUES
(
  'RPT-COMPLAINT', '민원 처리 종합 보고서', 'monthly', 'complaint', 'internal',
  '["CORE", "COMPLAINT", "REPORT"]'::jsonb, true, true, false, 70,
  '민원 접수·배정·처리기한·타임라인·반복민원·재발방지·공식 답변문서를 개인정보 비식별 처리하여 HWPX와 PDF로 생성',
  '[{"name":"period","label":"보고기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"민원 핵심지표","type":"summary"},{"title":"접수·배정·처리기한","type":"table"},{"title":"반복민원·재발방지","type":"table"},{"title":"공식 답변문서","type":"table"}]'::jsonb
),
(
  'RPT-SURVEY', '현황조사 결과 보고서', 'custom', 'survey', 'internal',
  '["CORE", "SURVEY", "REPORT"]'::jsonb, true, true, false, 80,
  '주차장 기본현황·기반시설·운영·이용실태·센서계획·사진증빙과 검토·승인 상태를 HWPX와 PDF로 생성',
  '[{"name":"period","label":"조사기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"조사 핵심지표","type":"summary"},{"title":"기본·기반시설","type":"table"},{"title":"운영·이용·센서계획","type":"table"},{"title":"사진·검토·문서근거","type":"table"}]'::jsonb
),
(
  'RPT-PLANNING', '신설사업 추진 현황 보고서', 'monthly', 'planning', 'internal',
  '["CORE", "PLANNING", "REPORT"]'::jsonb, true, true, false, 90,
  '신설 후보지·타당성·부지매입·공유재산·사전절차·사업계획·예산·공정·위험과 공식 문서번호를 HWPX와 PDF로 생성',
  '[{"name":"period","label":"보고기간","type":"daterange","required":true}]'::jsonb,
  '[{"title":"기획 핵심지표","type":"summary"},{"title":"후보지·타당성","type":"table"},{"title":"부지·공유재산·절차","type":"table"},{"title":"예산·공정·위험·문서","type":"table"}]'::jsonb
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
