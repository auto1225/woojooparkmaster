DROP VIEW IF EXISTS public.budget_plan_summary;
DROP VIEW IF EXISTS public.budget_execution_monthly;

ALTER TABLE public.budget_items ALTER COLUMN budget_type TYPE varchar(20);

CREATE OR REPLACE VIEW public.budget_plan_summary AS
SELECT bp.id AS plan_id,
    bp.fiscal_year, bp.plan_type, bp.title, bp.status,
    sum(CASE WHEN bi.budget_type::text = 'revenue' AND NOT bi.is_summary THEN bi.planned_amount ELSE 0 END) AS total_planned_revenue,
    sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.planned_amount ELSE 0 END) AS total_planned_expenditure,
    sum(CASE WHEN bi.budget_type::text = 'revenue' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) AS total_allocated_revenue,
    sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) AS total_allocated_expenditure,
    sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.executed_amount ELSE 0 END) AS total_executed_expenditure,
    CASE WHEN sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) > 0
        THEN round(sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.executed_amount ELSE 0 END)::numeric / sum(CASE WHEN bi.budget_type::text = 'expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END)::numeric * 100, 2)
        ELSE 0 END AS overall_execution_rate
FROM budget_plans bp LEFT JOIN budget_items bi ON bi.plan_id = bp.id
GROUP BY bp.id, bp.fiscal_year, bp.plan_type, bp.title, bp.status;

CREATE OR REPLACE VIEW public.budget_execution_monthly AS
SELECT bi.plan_id,
    date_trunc('month', be.execution_date::timestamp with time zone)::date AS month,
    bi.budget_type,
    sum(be.amount) AS total_amount,
    count(*) AS execution_count
FROM budget_executions be JOIN budget_items bi ON bi.id = be.item_id
WHERE be.status::text = ANY (ARRAY['approved','executed']::text[])
GROUP BY bi.plan_id, date_trunc('month', be.execution_date::timestamp with time zone), bi.budget_type;