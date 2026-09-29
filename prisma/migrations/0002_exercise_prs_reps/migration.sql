-- A PR is now (heaviest working weight, most reps at that weight) — see CONTEXT.md "PR".
-- CREATE OR REPLACE keeps the existing columns (same names/types/order — hence the ::numeric,
-- matching the old max() result type) and appends pr_reps, so code still reading only
-- pr_weight_kg keeps working between `migrate deploy` and the code deploy.
CREATE OR REPLACE VIEW public.exercise_prs WITH (security_invoker='true') AS
 SELECT DISTINCT ON (user_id, exercise_id)
    user_id,
    exercise_id,
    weight_kg::numeric AS pr_weight_kg,
    reps AS pr_reps
   FROM public.sets
  WHERE (NOT is_warmup)
  ORDER BY user_id, exercise_id, weight_kg DESC, reps DESC;
