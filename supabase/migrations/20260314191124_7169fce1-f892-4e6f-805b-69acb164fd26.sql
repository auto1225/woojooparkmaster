
-- Add notification_settings to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}';

-- Add kakao_map_appkey to system_config if not exists
INSERT INTO public.system_config (config_key, config_value, description) 
VALUES ('kakao_map_appkey', '', 'Kakao Maps API 앱키')
ON CONFLICT (config_key) DO NOTHING;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
