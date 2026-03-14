-- ============================================================
-- ParkMaster™ 데모 데이터 시드 (Demo Seed SQL)
-- 실행 위치: Supabase SQL Editor 또는 서버 psql
-- 모든 데모 데이터는 notes 필드에 '[DEMO]' 접두어 포함
-- 초기화: notes LIKE '[DEMO]%' 조건으로 삭제
-- ============================================================

-- ─── 1. 주차장 상세정보 보강 ───
UPDATE parking_lots SET
  total_spaces = CASE
    WHEN code LIKE '%-00%' THEN (random() * 280 + 20)::int
    ELSE (random() * 180 + 20)::int
  END,
  latitude = 33.50 + (random() - 0.5) * 0.10,
  longitude = 126.53 + (random() - 0.5) * 0.10,
  notes = '[DEMO] 데모 데이터 보강'
WHERE total_spaces IS NULL OR total_spaces = 0;

UPDATE parking_lots SET
  disabled_spaces = GREATEST(1, (total_spaces * (0.03 + random() * 0.02))::int),
  ev_spaces = GREATEST(0, (total_spaces * (0.02 + random() * 0.03))::int)
WHERE notes LIKE '[DEMO]%';

-- ─── 2. 장비 데모 데이터 (80대) ───
-- 주요 주차장에 장비 배치
DO $$
DECLARE
  lot_rec RECORD;
  eq_count INT := 0;
BEGIN
  FOR lot_rec IN SELECT id, code, name, total_spaces FROM parking_lots WHERE total_spaces > 50 ORDER BY total_spaces DESC LIMIT 15 LOOP
    -- CCTV 2~6대
    FOR i IN 1..(2 + (random()*4)::int) LOOP
      INSERT INTO equipment (lot_id, equipment_code, equipment_type, name, quantity, status, total_maintenance_cost, maintenance_count, notes)
      VALUES (lot_rec.id, 'EQ-' || LPAD((eq_count+1)::text, 4, '0'), 'cctv', lot_rec.name || ' CCTV-' || i, 1, 'normal', 0, 0, '[DEMO] 데모 장비');
      eq_count := eq_count + 1;
    END LOOP;
    -- 차단기 (100면+)
    IF lot_rec.total_spaces >= 100 THEN
      FOR i IN 1..2 LOOP
        INSERT INTO equipment (lot_id, equipment_code, equipment_type, name, quantity, status, total_maintenance_cost, maintenance_count, notes)
        VALUES (lot_rec.id, 'EQ-' || LPAD((eq_count+1)::text, 4, '0'), 'barrier', lot_rec.name || ' 차단기-' || i, 1, 'normal', 0, 0, '[DEMO] 데모 장비');
        eq_count := eq_count + 1;
      END LOOP;
      -- LPR
      INSERT INTO equipment (lot_id, equipment_code, equipment_type, name, quantity, status, total_maintenance_cost, maintenance_count, notes)
      VALUES (lot_rec.id, 'EQ-' || LPAD((eq_count+1)::text, 4, '0'), 'lpr', lot_rec.name || ' LPR', 2, 'normal', 0, 0, '[DEMO] 데모 장비');
      eq_count := eq_count + 1;
    END IF;
    -- 무인정산기 (50면+)
    IF lot_rec.total_spaces >= 50 AND random() > 0.5 THEN
      INSERT INTO equipment (lot_id, equipment_code, equipment_type, name, quantity, status, total_maintenance_cost, maintenance_count, notes)
      VALUES (lot_rec.id, 'EQ-' || LPAD((eq_count+1)::text, 4, '0'), 'kiosk', lot_rec.name || ' 무인정산기', 1, 'normal', 0, 0, '[DEMO] 데모 장비');
      eq_count := eq_count + 1;
    END IF;
    EXIT WHEN eq_count >= 80;
  END LOOP;
END $$;

-- 일부 장비 상태 변경
UPDATE equipment SET status = 'warning' WHERE notes LIKE '[DEMO]%' AND id IN (SELECT id FROM equipment WHERE notes LIKE '[DEMO]%' ORDER BY random() LIMIT 5);
UPDATE equipment SET status = 'broken' WHERE notes LIKE '[DEMO]%' AND status = 'normal' AND id IN (SELECT id FROM equipment WHERE notes LIKE '[DEMO]%' AND status = 'normal' ORDER BY random() LIMIT 3);
UPDATE equipment SET status = 'maintenance' WHERE notes LIKE '[DEMO]%' AND status = 'normal' AND id IN (SELECT id FROM equipment WHERE notes LIKE '[DEMO]%' AND status = 'normal' ORDER BY random() LIMIT 2);

-- ─── 3. 유지보수 20건 ───
DO $$
DECLARE
  eq_rec RECORD;
  maint_count INT := 0;
  lot_ids UUID[];
BEGIN
  SELECT array_agg(DISTINCT lot_id) INTO lot_ids FROM equipment WHERE notes LIKE '[DEMO]%';

  FOR eq_rec IN SELECT id, lot_id, name FROM equipment WHERE notes LIKE '[DEMO]%' ORDER BY random() LIMIT 20 LOOP
    INSERT INTO maintenance_logs (log_number, lot_id, equipment_id, maintenance_type, priority, title, parts_cost, labor_cost, other_cost, total_cost, status, notes)
    VALUES (
      'ML-DEMO-' || LPAD((maint_count+1)::text, 4, '0'),
      eq_rec.lot_id,
      eq_rec.id,
      CASE WHEN maint_count < 10 THEN 'scheduled' WHEN maint_count < 15 THEN 'emergency' ELSE 'repair' END,
      CASE WHEN maint_count < 10 THEN 'low' WHEN maint_count < 15 THEN 'high' ELSE 'medium' END,
      eq_rec.name || ' ' || CASE WHEN maint_count < 10 THEN '정기점검' WHEN maint_count < 15 THEN '긴급수리' ELSE '일반수리' END,
      (random() * 500000)::int,
      (random() * 200000)::int,
      0,
      (random() * 700000)::int,
      CASE WHEN maint_count < 13 THEN 'completed' WHEN maint_count < 16 THEN 'in_progress' ELSE 'reported' END,
      '[DEMO] 데모 유지보수'
    );
    maint_count := maint_count + 1;
  END LOOP;
END $$;

-- ─── 4. 안전점검 8건 ───
DO $$
DECLARE
  lot_rec RECORD;
  insp_count INT := 0;
  grades TEXT[] := ARRAY['A','A','A','B','B','B','C','D'];
BEGIN
  FOR lot_rec IN SELECT id, name FROM parking_lots WHERE total_spaces > 80 ORDER BY random() LIMIT 8 LOOP
    INSERT INTO safety_inspections (inspection_number, lot_id, inspection_type, inspection_date, checklist_results, total_items, pass_items, fail_items, overall_grade, status, notes)
    VALUES (
      'SI-DEMO-' || LPAD((insp_count+1)::text, 4, '0'),
      lot_rec.id,
      CASE WHEN insp_count < 4 THEN 'quarterly' ELSE 'monthly' END,
      (CURRENT_DATE - (random() * 180)::int)::text,
      '[{"category":"구조안전","item":"바닥 균열","result":"pass"},{"category":"소방","item":"소화기 비치","result":"pass"},{"category":"전기","item":"배선 상태","result":"pass"}]'::jsonb,
      10, CASE WHEN grades[insp_count+1] = 'A' THEN 9 WHEN grades[insp_count+1] = 'B' THEN 7 ELSE 5 END,
      CASE WHEN grades[insp_count+1] = 'A' THEN 1 WHEN grades[insp_count+1] = 'B' THEN 3 ELSE 5 END,
      0,
      grades[insp_count+1],
      'completed',
      '[DEMO] 데모 안전점검'
    );
    insp_count := insp_count + 1;
  END LOOP;
END $$;

-- ─── 5. 민원 30건 ───
DO $$
DECLARE
  lot_rec RECORD;
  comp_count INT := 0;
  categories TEXT[] := ARRAY['fee','fee','fee','fee','fee','fee','fee','fee','facility','facility','facility','facility','facility','facility','operation','operation','operation','operation','operation','enforcement','enforcement','enforcement','enforcement','safety','safety','safety','other','other','other','other'];
  channels TEXT[] := ARRAY['phone','phone','phone','phone','phone','phone','phone','phone','phone','phone','phone','phone','online','online','online','online','online','online','online','online','saeol','saeol','saeol','saeol','saeol','onsite','onsite','onsite','visit','visit'];
  statuses TEXT[] := ARRAY['closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','closed','responded','responded','responded','responded','responded','in_progress','in_progress','in_progress','in_progress','received','received','received'];
BEGIN
  FOR lot_rec IN SELECT id, name FROM parking_lots ORDER BY random() LIMIT 30 LOOP
    INSERT INTO complaints (complaint_number, lot_id, category, channel, title, content, status, priority, notes, created_at)
    VALUES (
      'CMP-DEMO-' || LPAD((comp_count+1)::text, 4, '0'),
      lot_rec.id,
      categories[comp_count+1],
      channels[comp_count+1],
      lot_rec.name || ' 관련 민원',
      '[DEMO] 데모 민원 내용입니다. ' || lot_rec.name || '에 대한 민원입니다.',
      statuses[comp_count+1],
      CASE WHEN comp_count < 20 THEN 'normal' WHEN comp_count < 26 THEN 'high' ELSE 'low' END,
      '[DEMO] 데모 민원',
      (CURRENT_TIMESTAMP - (random() * 180 || ' days')::interval)
    );
    comp_count := comp_count + 1;
    EXIT WHEN comp_count >= 30;
  END LOOP;
END $$;

-- ─── 6. 수입 데이터 (주요 20개소 × 90일) ───
DO $$
DECLARE
  lot_rec RECORD;
  d DATE;
  daily_base INT;
BEGIN
  FOR lot_rec IN SELECT id, total_spaces FROM parking_lots WHERE total_spaces > 50 ORDER BY total_spaces DESC LIMIT 20 LOOP
    daily_base := lot_rec.total_spaces * 500;
    FOR d IN SELECT generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day')::date LOOP
      INSERT INTO revenue_daily (lot_id, revenue_date, cash_amount, card_amount, mobile_amount, total_amount, total_vehicles, verified, notes)
      VALUES (
        lot_rec.id,
        d,
        (daily_base * 0.2 * (0.8 + random() * 0.4))::int,
        (daily_base * 0.6 * (0.8 + random() * 0.4))::int,
        (daily_base * 0.2 * (0.8 + random() * 0.4))::int,
        (daily_base * (0.8 + random() * 0.4))::int,
        (lot_rec.total_spaces * (0.5 + random() * 1.5))::int,
        d < CURRENT_DATE - 30,
        '[DEMO] 데모 수입'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─── 7. 예산 (현재 연도) ───
INSERT INTO budget_plans (fiscal_year, plan_type, title, status, total_revenue, total_expenditure, notes)
VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::int, 'original', EXTRACT(YEAR FROM CURRENT_DATE)::int || '년도 본예산', 'executed', 800000000, 500000000, '[DEMO] 데모 예산')
ON CONFLICT DO NOTHING;

-- ─── 완료 메시지 ───
DO $$ BEGIN RAISE NOTICE 'ParkMaster™ 데모 데이터 생성 완료!'; END $$;
