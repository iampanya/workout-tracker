alter table public.exercises
  add constraint exercises_muscle_group_check
  check (muscle_group in ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'));
