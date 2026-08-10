import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompletedSessions, sessionDisplayName } from "@/lib/sessions/history";
import { Card } from "@/components/ui/Card";
import { DeleteHistorySessionButton } from "./DeleteHistorySessionButton";

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();
  const sessions = await listCompletedSessions(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <div className="space-y-2">
        {sessions.map((session) => (
          <Card key={session.id} padding={false} className="flex items-center justify-between gap-2">
            <Link href={`/history/${session.id}`} className="flex flex-1 items-center justify-between gap-2 p-4">
              <span>
                <span className="font-medium">{sessionDisplayName(session)}</span>
                <span className="block text-sm text-muted">{session.session_date}</span>
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
            <div className="pr-2">
              <DeleteHistorySessionButton
                sessionId={session.id}
                sessionName={sessionDisplayName(session)}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
