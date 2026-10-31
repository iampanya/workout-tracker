-- Body-composition scans imported from a smart scale (lib/body/schema.ts) and per-metric goals.
-- Additive only. Metric columns mirror SCAN_METRIC_KEYS; segments/report hold the rest of the
-- report as JSON validated by the app.
CREATE TABLE public.body_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    measured_at timestamp(6) with time zone NOT NULL,
    source text DEFAULT 'arboleaf'::text NOT NULL,
    weight_kg numeric(7,2) NOT NULL,
    bmi numeric(7,2),
    body_fat_pct numeric(7,2),
    body_fat_kg numeric(7,2),
    skeletal_muscle_kg numeric(7,2),
    skeletal_muscle_pct numeric(7,2),
    muscle_mass_pct numeric(7,2),
    soft_lean_mass_kg numeric(7,2),
    fat_free_mass_kg numeric(7,2),
    body_water_l numeric(7,2),
    body_water_pct numeric(7,2),
    protein_kg numeric(7,2),
    protein_pct numeric(7,2),
    bone_mass_kg numeric(7,2),
    bone_mass_pct numeric(7,2),
    visceral_fat numeric(7,2),
    subcutaneous_fat_pct numeric(7,2),
    subcutaneous_fat_kg numeric(7,2),
    bmr_kcal numeric(7,2),
    smi numeric(7,2),
    waist_hip_ratio numeric(7,2),
    fitness_score numeric(7,2),
    height_cm numeric(7,2),
    age numeric(7,2),
    segments jsonb,
    report jsonb,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT body_scans_pkey PRIMARY KEY (id),
    CONSTRAINT body_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX body_scans_user_id_measured_at_key ON public.body_scans USING btree (user_id, measured_at);

CREATE TABLE public.body_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    target numeric(7,2) NOT NULL,
    start_value numeric(7,2) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT body_goals_pkey PRIMARY KEY (id),
    CONSTRAINT body_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT body_goals_metric_check CHECK (metric IN ('weight_kg', 'body_fat_pct', 'body_fat_kg', 'skeletal_muscle_kg'))
);

CREATE UNIQUE INDEX body_goals_user_id_metric_key ON public.body_goals USING btree (user_id, metric);
