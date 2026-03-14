
-- Fix search_path for new functions
ALTER FUNCTION update_bid_project_on_award() SET search_path = public;
ALTER FUNCTION calc_bid_rate() SET search_path = public;
