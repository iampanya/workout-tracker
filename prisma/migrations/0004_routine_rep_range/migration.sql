-- Optional rep range per routine exercise, used for the next-session target (double
-- progression). Additive only: old deployments ignore the nullable columns. Min and max are
-- set and cleared together (the IS NOT NULL guards matter: a NULL comparison would let a
-- half-set pair pass the CHECK).
ALTER TABLE public.routine_exercises
    ADD COLUMN target_reps_min integer,
    ADD COLUMN target_reps_max integer,
    ADD CONSTRAINT routine_exercises_rep_range_check CHECK (
        (target_reps_min IS NULL AND target_reps_max IS NULL)
        OR (target_reps_min IS NOT NULL AND target_reps_max IS NOT NULL
            AND target_reps_min BETWEEN 1 AND 50 AND target_reps_max BETWEEN target_reps_min AND 50)
    );
