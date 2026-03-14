
CREATE OR REPLACE FUNCTION update_equipment_on_maintenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.equipment_id IS NOT NULL THEN
    UPDATE equipment SET
      status = 'normal',
      status_changed_at = now(),
      last_maintenance_date = COALESCE(NEW.completed_at::date, CURRENT_DATE),
      total_maintenance_cost = total_maintenance_cost + COALESCE(NEW.parts_cost,0) + COALESCE(NEW.labor_cost,0) + COALESCE(NEW.other_cost,0),
      maintenance_count = maintenance_count + 1
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$;
