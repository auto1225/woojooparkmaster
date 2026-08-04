-- First post-operations report: Jeju public parking annual integrated report.
-- Historical RPT-YEARLY records remain linked to their original template.
INSERT INTO public.report_templates (
  template_code,
  name,
  report_type,
  report_category,
  target_audience,
  required_modules,
  template_format,
  is_system,
  is_active,
  is_favorite,
  sort_order,
  description,
  parameters,
  sections
) VALUES (
  'RPT-JEJU-ANNUAL',
  '제주시 공영주차장 연간 통합보고서',
  'annual',
  'comprehensive',
  'internal',
  '["CORE", "REPORT"]'::jsonb,
  'hwpx',
  true,
  true,
  true,
  2,
  '제주시 공영주차장의 연간 현황, 전년 비교, 유형별·월별 추이, 민원·시설·안전 분석, 중점관리 대상과 차년도 조치계획을 HWPX 원본과 동일 PDF로 생성',
  '[{"name":"year","label":"보고연도","type":"year","required":true},{"name":"comparison_year","label":"비교연도","type":"year","required":true},{"name":"annual_sections","label":"출력항목","type":"multiselect","required":true}]'::jsonb,
  '[{"title":"종합 현황","type":"summary"},{"title":"전년 대비 분석","type":"comparison"},{"title":"주차장 유형별 현황","type":"table"},{"title":"월별 운영 추이","type":"trend"},{"title":"민원·시설·안전 통합 분석","type":"analysis"},{"title":"중점관리 대상","type":"risk"},{"title":"종합 분석 및 차년도 조치계획","type":"narrative"},{"title":"자료 산출 및 검증 기준","type":"appendix"}]'::jsonb
)
ON CONFLICT (template_code) DO UPDATE SET
  name = EXCLUDED.name,
  report_type = EXCLUDED.report_type,
  report_category = EXCLUDED.report_category,
  target_audience = EXCLUDED.target_audience,
  required_modules = EXCLUDED.required_modules,
  template_format = EXCLUDED.template_format,
  is_system = EXCLUDED.is_system,
  is_active = EXCLUDED.is_active,
  is_favorite = EXCLUDED.is_favorite,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  parameters = EXCLUDED.parameters,
  sections = EXCLUDED.sections;

UPDATE public.report_templates
SET is_active = false
WHERE template_code IN ('RPT-YEARLY', 'RPT-DEMO-ANNUAL')
  AND EXISTS (
    SELECT 1
    FROM public.report_templates
    WHERE template_code = 'RPT-JEJU-ANNUAL'
      AND is_active = true
  );
