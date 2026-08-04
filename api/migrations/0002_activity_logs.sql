-- ============================================================
-- 0002_activity_logs.sql
-- 감사 로그 (누가·언제·무엇을·어떻게 변경했는가)
-- 공공기관 업무 시스템 표준 요건.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,        -- CREATE / UPDATE / DELETE / LOGIN / ...
  table_name VARCHAR(100),             -- 대상 테이블 (해당 시)
  record_id UUID,                      -- 대상 행 ID (해당 시)
  diff JSONB,                          -- { before, after } 또는 변경분만
  extra JSONB,                         -- 액션별 부가 정보
  ip_address VARCHAR(45),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_table_record_idx
  ON activity_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON activity_logs(created_at DESC);

-- ※ activity_logs는 INSERT만 발생. UPDATE/DELETE는 운영 DBA가 정책에 따라
--    오래된 로그를 archive 테이블로 이관 후 삭제하는 정도만 허용.
COMMENT ON TABLE activity_logs IS
  '감사 로그. 변경 기록은 추가만 하고 절대 수정하지 않는다.';
