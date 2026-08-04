-- Provenance-aware storage for the December 2025 Jeju paid-parking survey.

CREATE TABLE IF NOT EXISTS public.survey_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text NOT NULL UNIQUE,
  title text NOT NULL,
  publisher text NOT NULL,
  contractor text,
  report_month date NOT NULL,
  source_filename text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_page_count integer NOT NULL CHECK (source_page_count > 0),
  record_count integer NOT NULL CHECK (record_count >= 0),
  declared_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'validated', 'rejected')),
  validated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parking_lot_survey_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL UNIQUE REFERENCES public.parking_lots(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.survey_data_sources(id) ON DELETE RESTRICT,
  source_record_no integer NOT NULL CHECK (source_record_no > 0),
  general_spaces integer NOT NULL CHECK (general_spaces >= 0),
  other_space_type text,
  operation_category text,
  operating_hours_text text,
  management_type text,
  resident_staff_count integer NOT NULL DEFAULT 0 CHECK (resident_staff_count >= 0),
  control_system_linked boolean NOT NULL DEFAULT false,
  parking_portal_linked boolean NOT NULL DEFAULT false,
  display_installation_status text,
  display_network_type text,
  display_use_status text,
  entrance_count integer NOT NULL DEFAULT 0 CHECK (entrance_count >= 0),
  exit_count integer NOT NULL DEFAULT 0 CHECK (exit_count >= 0),
  entrance_exit_shared boolean NOT NULL DEFAULT false,
  existing_sensor_status text,
  sensor_manufacturer text,
  sensor_use_status text,
  control_manufacturer text,
  utilization_band text,
  peak_period text,
  primary_users text,
  user_notes text,
  new_sensor_target_count integer NOT NULL DEFAULT 0 CHECK (new_sensor_target_count >= 0),
  gateway_target_count integer NOT NULL DEFAULT 0 CHECK (gateway_target_count >= 0),
  display_development_possible text,
  portal_link_possible text,
  power_supply_status text,
  wired_network_status text,
  windows_update_status text,
  priority_rank integer CHECK (priority_rank > 0),
  priority_score integer CHECK (priority_score >= 0),
  priority_note text,
  source_pages jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_survey_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_no)
);

CREATE INDEX IF NOT EXISTS idx_parking_lot_survey_source
  ON public.parking_lot_survey_facts(source_id);
CREATE INDEX IF NOT EXISTS idx_parking_lot_survey_priority
  ON public.parking_lot_survey_facts(priority_rank);
CREATE INDEX IF NOT EXISTS idx_parking_lot_survey_utilization
  ON public.parking_lot_survey_facts(utilization_band);

COMMENT ON TABLE public.survey_data_sources IS
  'Survey source identity, checksum, validation totals, and known report discrepancies.';
COMMENT ON TABLE public.parking_lot_survey_facts IS
  'One provenance-preserving December 2025 survey record for each Jeju paid public parking lot.';
COMMENT ON COLUMN public.parking_lot_survey_facts.general_spaces IS
  'Derived as total spaces minus disabled, EV, compact, pregnant, and other spaces.';
COMMENT ON COLUMN public.parking_lot_survey_facts.raw_survey_data IS
  'Verbatim normalized values from every detailed PDF table, including section row and PDF page.';

ALTER TABLE public.survey_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_lot_survey_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_sources_select"
  ON public.survey_data_sources FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "survey_sources_manage"
  ON public.survey_data_sources FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "parking_lot_survey_facts_select"
  ON public.parking_lot_survey_facts FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "parking_lot_survey_facts_manage"
  ON public.parking_lot_survey_facts FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));
