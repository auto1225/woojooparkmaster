-- ============================================================
-- 0001_init_users.sql
-- 자체 users + profiles + code_master 초기 스키마.
-- Supabase의 auth.users 의존성을 제거하고, 같은 모양의 자체 테이블을 사용한다.
-- ============================================================

-- ENUM 타입은 기존 Supabase 마이그레이션과 동일 이름·동일 값으로 유지한다.
-- 향후 supabase/migrations의 SQL을 그대로 가져올 때 이름 충돌이 없도록 IF NOT EXISTS 패턴 사용.
DO $$ BEGIN
  CREATE TYPE team_type AS ENUM ('operations', 'facilities', 'planning', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('admin', 'manager', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────
-- users — 인증 정보 보관 (이메일·비밀번호 해시·refresh 토큰)
-- 기존 supabase auth.users를 대체.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- profiles — 사용자 부가정보 (기존 Supabase profiles 동일 컬럼)
-- ※ 기존 SQL의 REFERENCES auth.users(id) 부분을 우리 users(id) 참조로 교체했다.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  employee_number VARCHAR(30),
  department VARCHAR(100),
  team team_type NOT NULL DEFAULT 'operations',
  role role_type NOT NULL DEFAULT 'viewer',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────
-- refresh_tokens — JWT refresh 토큰 폐기 추적
-- 로그아웃 시 무효화하기 위해 DB에 보관.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent VARCHAR(300),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);

-- ──────────────────────────────────────────────
-- code_master — 코드 마스터 (시·도, 차량 유형 등 공용 코드)
-- end-to-end 프로토타입의 대상 테이블.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_code, code)
);

CREATE INDEX IF NOT EXISTS code_master_group_code_idx ON code_master(group_code);

-- ──────────────────────────────────────────────
-- updated_at 자동 갱신 트리거 함수.
-- 기존 Supabase 마이그레이션에도 같은 패턴이 반복되므로 공용 함수로 분리.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS code_master_set_updated_at ON code_master;
CREATE TRIGGER code_master_set_updated_at
BEFORE UPDATE ON code_master
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
