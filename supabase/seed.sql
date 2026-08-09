insert into public.exercises (user_id, name, muscle_group, is_preset) values
  (null, 'Bench Press', 'Chest', true),
  (null, 'Incline Bench Press', 'Chest', true),
  (null, 'Squat', 'Legs', true),
  (null, 'Deadlift', 'Back', true),
  (null, 'Overhead Press', 'Shoulders', true),
  (null, 'Barbell Row', 'Back', true),
  (null, 'Pull-up', 'Back', true),
  (null, 'Lat Pulldown', 'Back', true),
  (null, 'Dumbbell Shoulder Press', 'Shoulders', true),
  (null, 'Leg Press', 'Legs', true),
  (null, 'Leg Curl', 'Legs', true),
  (null, 'Leg Extension', 'Legs', true),
  (null, 'Hip Thrust', 'Legs', true),
  (null, 'Bicep Curl', 'Arms', true),
  (null, 'Tricep Pushdown', 'Arms', true)
on conflict do nothing;
