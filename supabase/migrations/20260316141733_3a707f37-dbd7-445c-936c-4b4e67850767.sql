INSERT INTO storage.buckets (id, name, public)
VALUES ('demo-files', 'demo-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Demo files are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'demo-files');

CREATE POLICY "Authenticated users can manage demo files"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'demo-files')
WITH CHECK (bucket_id = 'demo-files');