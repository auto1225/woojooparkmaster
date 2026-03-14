
-- Fix security definer views by setting security_invoker = true
CREATE OR REPLACE VIEW revenue_monthly WITH (security_invoker = true) AS
SELECT
  lot_id,
  DATE_TRUNC('month', revenue_date)::date AS month,
  SUM(cash_amount) AS cash_total,
  SUM(card_amount) AS card_total,
  SUM(mobile_amount) AS mobile_total,
  SUM(monthly_pass_amount) AS pass_total,
  SUM(other_amount) AS other_total,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  SUM(exemption_count) AS exemptions_total,
  SUM(exemption_amount) AS exemption_amount_total,
  COUNT(*) AS days_recorded
FROM revenue_daily
GROUP BY lot_id, DATE_TRUNC('month', revenue_date);

CREATE OR REPLACE VIEW revenue_yearly WITH (security_invoker = true) AS
SELECT
  lot_id,
  EXTRACT(YEAR FROM revenue_date)::integer AS year,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  COUNT(*) AS days_recorded
FROM revenue_daily
GROUP BY lot_id, EXTRACT(YEAR FROM revenue_date);

CREATE OR REPLACE VIEW revenue_summary_monthly WITH (security_invoker = true) AS
SELECT
  DATE_TRUNC('month', revenue_date)::date AS month,
  COUNT(DISTINCT lot_id) AS lot_count,
  SUM(cash_amount) AS cash_total,
  SUM(card_amount) AS card_total,
  SUM(mobile_amount) AS mobile_total,
  SUM(monthly_pass_amount) AS pass_total,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  SUM(exemption_amount) AS exemption_total
FROM revenue_daily
GROUP BY DATE_TRUNC('month', revenue_date)
ORDER BY month DESC;

-- Fix function search_path
CREATE OR REPLACE FUNCTION calc_recon_diff_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other) > 0 THEN
    NEW.diff_rate := ROUND(
      ((NEW.reported_cash + NEW.reported_card + NEW.reported_mobile + NEW.reported_other) -
       (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other))::decimal /
      (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other) * 100
    , 2);
  ELSE
    NEW.diff_rate := 0;
  END IF;
  RETURN NEW;
END;
$$;
