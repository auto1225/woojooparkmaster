-- ============================================================
-- ParkMaster™ 데모 데이터 초기화 (Cleanup SQL)
-- notes LIKE '[DEMO]%' 조건으로 데모 데이터만 삭제
-- ============================================================

-- 의존성 역순으로 삭제
DELETE FROM complaint_comments WHERE complaint_id IN (SELECT id FROM complaints WHERE notes LIKE '[DEMO]%');
DELETE FROM complaints WHERE notes LIKE '[DEMO]%';
DELETE FROM revenue_daily WHERE notes LIKE '[DEMO]%';
DELETE FROM safety_inspections WHERE notes LIKE '[DEMO]%';
DELETE FROM maintenance_logs WHERE notes LIKE '[DEMO]%';
DELETE FROM equipment WHERE notes LIKE '[DEMO]%';
DELETE FROM budget_executions WHERE notes LIKE '[DEMO]%';
DELETE FROM budget_items WHERE plan_id IN (SELECT id FROM budget_plans WHERE notes LIKE '[DEMO]%');
DELETE FROM budget_plans WHERE notes LIKE '[DEMO]%';

-- 주차장 보강 데이터 원복 (notes만 초기화)
UPDATE parking_lots SET notes = NULL WHERE notes LIKE '[DEMO]%';

DO $$ BEGIN RAISE NOTICE 'ParkMaster™ 데모 데이터 초기화 완료!'; END $$;
