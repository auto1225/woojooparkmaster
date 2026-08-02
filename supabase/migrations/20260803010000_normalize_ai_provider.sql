INSERT INTO public.system_config (config_key, config_value, description)
VALUES ('ai_provider', 'generic_gateway', 'AI 제공자')
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    description = EXCLUDED.description;
