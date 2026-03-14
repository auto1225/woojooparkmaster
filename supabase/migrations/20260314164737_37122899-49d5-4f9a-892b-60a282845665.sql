
-- Create storage bucket for survey photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('survey-photos', 'survey-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']);

-- Storage RLS policies
CREATE POLICY "survey_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'survey-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "survey_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'survey-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "survey_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'survey-photos' AND auth.uid() IS NOT NULL);
