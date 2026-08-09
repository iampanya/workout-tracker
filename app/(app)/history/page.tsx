import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompletedSessions } from "@/lib/sessions/history";

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();
  const sessions = await listCompletedSessions(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <ul className="divide-y">
        {sessions.map((session) => (
          <li key={session.id} className="py-2">
            <Link href={`/history/${session.id}`} className="underline">
              {session.name ?? "Workout"} — {session.session_date}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
