
-- Fix overly permissive policy on security_training_logs
DROP POLICY IF EXISTS "Admin can manage training logs" ON security_training_logs;

CREATE POLICY "Admin can insert training logs"
  ON security_training_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can update training logs"
  ON security_training_logs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can delete training logs"
  ON security_training_logs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
