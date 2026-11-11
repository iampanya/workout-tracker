-- Indexes for the per-user lookups on hot paths. Additive only: old deployments are unaffected.
-- sessions: the dashboard/insights window (user_id + session_date range) and history lists.
CREATE INDEX sessions_user_id_session_date_idx ON public.sessions USING btree (user_id, session_date);
-- session_exercises: the log screen's "recent sessions per exercise" (getRecentSessionSets).
CREATE INDEX session_exercises_user_id_exercise_id_idx ON public.session_exercises USING btree (user_id, exercise_id);
