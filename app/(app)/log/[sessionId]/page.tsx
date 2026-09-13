import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listExercises } from "@/lib/exercises/service";
import { getPriorMaxWeights } from "@/lib/sessions/service";
import { sessionDisplayName } from "@/lib/sessions/history";
import { QueryProvider } from "./QueryProvider";
import { LoggingClient } from "./LoggingClient";

export default async function LogSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const userId = (await getAuthUser())!.id;

  // The session header, its exercises, and the exercise catalog are all independent, so fetch
  // them together. The session/exercises queries are scoped by user_id (replacing RLS), so a
  // session that isn't the caller's returns null → notFound.
  const [session, sessionExercises, availableExercises] = await Promise.all([
    prisma.sessions.findFirst({
      where: { id: sessionId, user_id: userId },
      include: { routines: { select: { name: true } } },
    }),
    prisma.session_exercises.findMany({
      where: { session_id: sessionId, user_id: userId },
      orderBy: { position: "asc" },
      include: { exercises: { select: { id: true, name: true } }, sets: true },
    }),
    listExercises(prisma, userId),
  ]);
  if (!session) {
    notFound();
  }
  const displayName = sessionDisplayName({
    name: session.name,
    routineName: session.routines?.name ?? null,
  });

  const exerciseIds = [...new Set(sessionExercises.map((se) => se.exercise_id))];
  const prMap = await getPriorMaxWeights(prisma, userId, exerciseIds);

  const exercises = sessionExercises.map((se) => ({
    sessionExerciseId: se.id,
    exerciseId: se.exercise_id,
    exerciseName: se.exercises.name,
    sets: [...se.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ ...s, weight_kg: Number(s.weight_kg) })),
    prWeightKg: prMap[se.exercise_id] ?? null,
  }));

  return (
    <QueryProvider>
      <LoggingClient
        sessionId={sessionId}
        sessionName={displayName}
        initialExercises={exercises as never}
        availableExercises={availableExercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscle_group,
        }))}
      />
    </QueryProvider>
  );
}
