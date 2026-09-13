SELECT
  user_id,
  exercise_id,
  max(weight_kg) AS pr_weight_kg
FROM
  sets
WHERE
  (NOT is_warmup)
GROUP BY
  user_id,
  exercise_id;