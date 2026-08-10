import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompletedSessions } from "@/lib/sessions/history";
import { Card } from "@/components/ui/Card";

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();
  const sessions = await listCompletedSessions(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <div className="space-y-2">
        {sessions.map((session) => (
          <Card key={session.id} padding={false}>
            <Link href={`/history/${session.id}`} className="flex items-center justify-between gap-2 p-4">
              <span>
                <span className="font-medium">{session.name ?? "Workout"}</span>
                <span className="block text-sm text-muted">{session.session_date}</span>
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
