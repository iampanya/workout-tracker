import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CaretRight, PersonSimple } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { addDays, getTodayString } from "@/lib/date";
import { countWorkingSetsByMuscleGroup, listBodyGoals, listBodyScans } from "@/lib/body/service";
import { suggestedGoalTargets } from "@/lib/body/metrics";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LatestSnapshot } from "./LatestSnapshot";
import { ImportScanSheet } from "./ImportScanSheet";
import { GoalsCard } from "./GoalsCard";
import { TrendChart } from "./TrendChart";
import { BalanceCard } from "./BalanceCard";

// The balance card compares the latest scan with this many days of training (today inclusive).
const BALANCE_WINDOW_DAYS = 28;

export default async function BodyPage() {
  const user = await getAuthUser();
  const today = getTodayString();
  const [scans, goals, setCounts] = await Promise.all([
    listBodyScans(prisma, user!.id),
    listBodyGoals(prisma, user!.id),
    countWorkingSetsByMuscleGroup(prisma, user!.id, addDays(today, -(BALANCE_WINDOW_DAYS - 1)), today),
  ]);
  const [locale, t, tc, format] = await Promise.all([
    getLocale(),
    getTranslations("body"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const latest = scans.at(-1) ?? null;
  const previous = scans.at(-2) ?? null;
  const existingMeasuredAt = scans.map((scan) => scan.measured_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {latest && <ImportScanSheet existingMeasuredAt={existingMeasuredAt} />}
      </div>

      {!latest ? (
        <EmptyState
          icon={<PersonSimple className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<ImportScanSheet existingMeasuredAt={existingMeasuredAt} variant="primary" />}
        />
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-medium">{t("latest")}</h2>
              <span className="text-sm text-muted">
                {t("measuredOn", { date: formatRelativeDate(latest.scan_date, today, locale, relativeLabels) })}
              </span>
            </div>
            <LatestSnapshot latest={latest} previous={previous} />
          </section>

          <GoalsCard
            goals={goals}
            current={{
              weight_kg: latest.weight_kg,
              body_fat_pct: latest.body_fat_pct,
              body_fat_kg: latest.body_fat_kg,
              skeletal_muscle_kg: latest.skeletal_muscle_kg,
            }}
            suggestion={suggestedGoalTargets(latest)}
          />

          <section className="space-y-2">
            <h2 className="font-medium">{t("trend")}</h2>
            <Card>
              {scans.length >= 2 ? (
                <TrendChart
                  data={scans.map((scan) => ({
                    date: scan.scan_date,
                    weight_kg: scan.weight_kg,
                    body_fat_pct: scan.body_fat_pct,
                    body_fat_kg: scan.body_fat_kg,
                    skeletal_muscle_kg: scan.skeletal_muscle_kg,
                  }))}
                  goalTargets={Object.fromEntries(goals.map((goal) => [goal.metric, goal.target]))}
                />
              ) : (
                <p className="text-sm text-muted">{t("trendNeedsMore")}</p>
              )}
            </Card>
          </section>

          <BalanceCard segments={latest.segments} setCounts={setCounts} />

          <section className="space-y-2">
            <h2 className="font-medium">{t("history")}</h2>
            <div className="space-y-2">
              {[...scans].reverse().map((scan) => (
                <Card key={scan.id} padding={false}>
                  <Link href={`/body/${scan.id}`} className="flex items-center justify-between gap-2 p-4">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatRelativeDate(scan.scan_date, today, locale, relativeLabels)}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {n(scan.weight_kg ?? 0)} kg
                        {scan.body_fat_pct !== null && ` · ${n(scan.body_fat_pct)}%`}
                        {scan.skeletal_muscle_kg !== null &&
                          ` · ${t("trendMetrics.skeletal_muscle_kg")} ${n(scan.skeletal_muscle_kg)} kg`}
                      </span>
                    </span>
                    <CaretRight className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
