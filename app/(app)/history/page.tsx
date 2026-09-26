import Link from "next/link";
import { CaretRight, ClockCounterClockwise, Play } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getLocalDateString } from "@/lib/date";
import {
  listCompletedSessions,
  sessionDisplayName,
  type CompletedSessionListItem,
} from "@/lib/sessions/history";
import { formatDuration, formatMonthHeading, formatRelativeDate } from "@/lib/sessions/summary";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteHistorySessionButton } from "./DeleteHistorySessionButton";

const PAGE_SIZE = 30;

function groupByMonth(sessions: CompletedSessionListItem[]) {
  const groups: { heading: string; sessions: CompletedSessionListItem[] }[] = [];
  for (const session of sessions) {
    const heading = formatMonthHeading(session.session_date);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.sessions.push(session);
    else groups.push({ heading, sessions: [session] });
  }
  return groups;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // "Show more" grows ?show by a page; fetch one extra row to know whether more exist.
  const requested = Number((await searchParams).show);
  const show = Number.isInteger(requested) && requested > 0 ? requested : PAGE_SIZE;
  const user = await getAuthUser();
  const rows = await listCompletedSessions(prisma, user!.id, { take: show + 1 });
  const hasMore = rows.length > show;
  const sessions = rows.slice(0, show);
  const today = getLocalDateString();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>
      {sessions.length === 0 ? (
        <EmptyState
          icon={<ClockCounterClockwise className="h-6 w-6" />}
          title="No workouts logged yet"
          description="Finished sessions show up here so you can look back on your progress."
          action={
            <ButtonLink href="/log" icon={<Play className="h-4 w-4" weight="fill" />}>
              Start a workout
            </ButtonLink>
          }
        />
      ) : (
        <>
          {groupByMonth(sessions).map((group) => (
            <section key={group.heading} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                {group.heading}
              </h2>
              {group.sessions.map((session) => (
                <Card
                  key={session.id}
                  padding={false}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={`/history/${session.id}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 p-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {sessionDisplayName(session)}
                      </span>
                      <span className="block text-sm text-muted">
                        {formatRelativeDate(session.session_date, today)}
                        {session.stats.durationMin !== null &&
                          ` · ${formatDuration(session.stats.durationMin)}`}
                      </span>
                      <span className="block truncate text-sm text-muted tabular-nums">
                        {session.stats.exerciseCount}{" "}
                        {session.stats.exerciseCount === 1 ? "exercise" : "exercises"} ·{" "}
                        {session.stats.setCount} sets · {session.stats.volumeKg.toLocaleString()} kg
                      </span>
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
            </section>
          ))}
          {hasMore && (
            <ButtonLink
              href={`/history?show=${show + PAGE_SIZE}`}
              scroll={false}
              variant="secondary"
              className="w-full"
            >
              Show more
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}
