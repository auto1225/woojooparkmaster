
-- P5-3: Security columns for login lockout
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_fail_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- P5-5: System version in system_config
INSERT INTO system_config (config_key, config_value) VALUES ('system_version', '1.0.0') ON CONFLICT (config_key) DO NOTHING;
INSERT INTO system_config (config_key, config_value) VALUES ('backup_schedule', 'daily') ON CONFLICT (config_key) DO NOTHING;
INSERT INTO system_config (config_key, config_value) VALUES ('backup_time', '02:00') ON CONFLICT (config_key) DO NOTHING;
INSERT INTO system_config (config_key, config_value) VALUES ('backup_retention_days', '90') ON CONFLICT (config_key) DO NOTHING;
INSERT INTO system_config (config_key, config_value) VALUES ('max_concurrent_sessions', '3') ON CONFLICT (config_key) DO NOTHING;
