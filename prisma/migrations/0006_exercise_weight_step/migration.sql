-- Per-user weight step for an exercise, used by the next-session target (resolveWeightStep in
-- lib/insights/progression.ts). Presets are shared rows (exercises.user_id IS NULL), so the step
-- can't live on exercises. Additive only: old deployments never read this table.
CREATE TABLE public.exercise_settings (
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    weight_step_kg numeric(5,2) NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exercise_settings_pkey PRIMARY KEY (user_id, exercise_id),
    CONSTRAINT exercise_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT exercise_settings_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE,
    CONSTRAINT exercise_settings_weight_step_check CHECK (weight_step_kg > 0 AND weight_step_kg <= 50)
);
