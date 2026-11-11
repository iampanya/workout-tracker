import type { PrismaClient } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";
import {
  buildInsights,
  windowWeeks,
  type AnalysisSession,
  type Insights,
  type RoutineExerciseRef,
} from "./analysis";

// Everything the /insights page and the dashboard card show: the window's completed sessions
// (working sets only) plus the current exercises of the routines used in it, analysed by the
// pure rules in ./analysis.
export async function getInsights(db: PrismaClient, userId: string, todayStr: string): Promise<Insights> {
  const inWindow = {
    user_id: userId,
    completed_at: { not: null },
    session_date: { gte: new Date(windowWeeks(todayStr)[0]), lte: new Date(todayStr) },
  };
  // Both queries filter on the same window, so the routine query doesn't wait for the sessions.
  const [rows, routineRows] = await Promise.all([
    db.sessions.findMany({
      where: inWindow,
      orderBy: [{ session_date: "asc" }, { completed_at: "asc" }],
      select: {
        id: true,
        session_date: true,
        routine_id: true,
        session_exercises: {
          where: { user_id: userId },
          orderBy: { position: "asc" },
          select: {
            exercise_id: true,
            exercises: { select: { name: true, muscle_group: true } },
            sets: { where: { user_id: userId, is_warmup: false }, select: { weight_kg: true, reps: true } },
          },
        },
      },
    }),
    db.routine_exercises.findMany({
      where: { user_id: userId, routines: { user_id: userId, sessions: { some: inWindow } } },
      orderBy: [{ routine_id: "asc" }, { position: "asc" }],
      select: {
        routine_id: true,
        exercise_id: true,
        exercises: { select: { name: true } },
        routines: { select: { name: true } },
      },
    }),
  ]);

  const sessions: AnalysisSession[] = rows.map((row) => ({
    id: row.id,
    date: toDateOnlyString(row.session_date),
    routineId: row.routine_id,
    exercises: row.session_exercises.map((se) => ({
      exerciseId: se.exercise_id,
      name: se.exercises.name,
      muscleGroup: se.exercises.muscle_group,
      sets: se.sets.map((s) => ({ weightKg: Number(s.weight_kg), reps: s.reps })),
    })),
  }));

  const routineExercises: RoutineExerciseRef[] = routineRows.map((row) => ({
    routineId: row.routine_id,
    routineName: row.routines.name,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises.name,
  }));

  return buildInsights(sessions, routineExercises, todayStr);
}
