import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Play, Trophy, Fire, CalendarCheck, Barbell, CaretRight } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getTodayString, getWeekStart } from "@/lib/date";
import { getInProgressSessions } from "@/lib/dashboard/current";
import {
  listPrsFromLastCompletedSession,
  getOverviewStats,
  getWeeklyVolume,
  listTopPrs,
} from "@/lib/dashboard/service";
import { listCompletedSessions, sessionDisplayName } from "@/lib/sessions/history";
import { formatRelativeDate, splitDuration } from "@/lib/sessions/summary";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { DiscardSessionButton } from "./DiscardSessionButton";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";

const MAX_PRS = 6;

export default async function DashboardPage() {
  const user = await getAuthUser();
  const today = getTodayString();
  const [inProgress, newPrs, overview, weeklyVolume, topPrs, recentWorkouts] = await Promise.all([
    getInProgressSessions(),
    listPrsFromLastCompletedSession(prisma, user!.id),
    getOverviewStats(prisma, user!.id, today),
    getWeeklyVolume(prisma, user!.id, 8, today),
    listTopPrs(prisma, user!.id, MAX_PRS),
    listCompletedSessions(prisma, user!.id, { take: 5 }),
  ]);
  const [locale, tc, t, format] = await Promise.all([
    getLocale(),
    getTranslations("common"),
    getTranslations("dashboard"),
    getFormatter(),
  ]);
  const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };
  const freeform = tc("freeformWorkout");
  const hasWeeklyVolume = weeklyVolume.some((w) => w.volumeKg > 0);
  // With a workout already open, the primary CTA resumes it instead of starting a second one.
  const current = inProgress[0] ?? null;

  // One "Personal records" list: PRs set in the last workout first (marked NEW), then the
  // heaviest all-time lifts.
  const newPrIds = new Set(newPrs.map((pr) => pr.exerciseId));
  const prs = [...newPrs, ...topPrs.filter((pr) => !newPrIds.has(pr.exerciseId))].slice(0, MAX_PRS);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <ButtonLink
        href={current ? `/log/${current.id}` : "/log"}
        size="lg"
        icon={<Play className="h-5 w-5" weight="fill" />}
        className="w-full"
      >
        <span className="truncate">
          {current ? t("resume", { name: sessionDisplayName(current, freeform) }) : t("start")}
        </span>
      </ButtonLink>

      {inProgress.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("inProgress")}</h2>
          <div className="space-y-2">
            {inProgress.map((session) => (
              <Card key={session.id} className="flex items-center justify-between">
                <Link href={`/log/${session.id}`} className="flex-1 py-1">
                  <div className="font-medium">{sessionDisplayName(session, freeform)}</div>
                  <div className="text-sm text-muted">
                    {t("started", {
                      when: formatRelativeDate(session.session_date, today, locale, relativeLabels).toLowerCase(),
                    })}
                  </div>
                </Link>
                <DiscardSessionButton sessionId={session.id} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("overview")}</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label={t("streak")}
            value={overview.streakDays}
            unit={t("days", { count: overview.streakDays })}
            icon={<Fire className="h-4 w-4" />}
            tone={overview.streakDays > 0 ? "success" : "neutral"}
          />
          <StatCard
            label={t("thisWeek")}
            value={overview.sessionsThisWeek}
            unit={t("sessions", { count: overview.sessionsThisWeek })}
            icon={<CalendarCheck className="h-4 w-4" />}
          />
          <StatCard
            label={t("volume")}
            value={format.number(Math.round(overview.volumeThisWeekKg))}
            unit="kg"
            icon={<Barbell className="h-4 w-4" />}
          />
        </div>
      </section>

      {hasWeeklyVolume && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("weeklyVolume")}</h2>
          <Card>
            <WeeklyVolumeChart data={weeklyVolume} currentWeekStart={getWeekStart(today)} />
          </Card>
        </section>
      )}

      {prs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("personalRecords")}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {prs.map((pr) => {
              const isNew = newPrIds.has(pr.exerciseId);
              return (
                <StatCard
                  key={pr.exerciseId}
                  href={`/exercises/${pr.exerciseId}`}
                  label={pr.exerciseName}
                  value={pr.weightKg}
                  unit={`kg × ${pr.reps}`}
                  tone={isNew ? "success" : "neutral"}
                  badge={isNew ? <Badge tone="success">{t("newBadge")}</Badge> : undefined}
                  icon={<Trophy className="h-4 w-4" weight={isNew ? "fill" : "regular"} />}
                />
              );
            })}
          </div>
        </section>
      )}

      {recentWorkouts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">{t("recentWorkouts")}</h2>
            <Link
              href="/history"
              className="rounded text-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("seeAll")}
            </Link>
          </div>
          <div className="space-y-2">
            {recentWorkouts.map((session) => (
              <Card key={session.id} padding={false}>
                <Link
                  href={`/history/${session.id}`}
                  className="flex items-center justify-between gap-2 p-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {sessionDisplayName(session, freeform)}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {formatRelativeDate(session.session_date, today, locale, relativeLabels)} ·{" "}
                      {tc("sets", { count: session.stats.setCount })} ·{" "}
                      {format.number(session.stats.volumeKg)} kg
                      {session.stats.durationMin !== null &&
                        ` · ${tc("duration", splitDuration(session.stats.durationMin))}`}
                    </span>
                  </span>
                  <CaretRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
