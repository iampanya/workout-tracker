update public.exercises
  set muscle_group = null
  where muscle_group is not null
    and muscle_group not in ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core');

alter table public.exercises
  add constraint exercises_muscle_group_check
  check (muscle_group in ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'));
