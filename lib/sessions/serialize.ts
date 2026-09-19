import type { sessions } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";

// The string-dated session shape the UI consumes: session_date as YYYY-MM-DD, timestamps as ISO.
// Kept as one type + serializer so history (completed) and dashboard (in-progress) stay in sync.
export type CompletedSession = {
  id: string;
  user_id: string;
  routine_id: string | null;
  name: string | null;
  session_date: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};

export function toCompletedSession(s: sessions): CompletedSession {
  return {
    id: s.id,
    user_id: s.user_id,
    routine_id: s.routine_id,
    name: s.name,
    session_date: toDateOnlyString(s.session_date),
    started_at: s.started_at.toISOString(),
    completed_at: s.completed_at ? s.completed_at.toISOString() : null,
    notes: s.notes,
  };
}
