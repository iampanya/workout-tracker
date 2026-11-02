import { getLocale, getTranslations } from "next-intl/server";
import { ChartLineUp } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getTodayString } from "@/lib/date";
import { getInsights } from "@/lib/insights/service";
import { formatShortDate } from "@/lib/sessions/summary";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConsistencyCard } from "./ConsistencyCard";
import { DeloadBanner } from "./DeloadBanner";
import { MuscleVolumeCard } from "./MuscleVolumeCard";
import { TrendsCard } from "./TrendsCard";

export default async function InsightsPage() {
  const user = await getAuthUser();
  const today = getTodayString();
  const [insights, locale, t] = await Promise.all([
    getInsights(prisma, user!.id, today),
    getLocale(),
    getTranslations("insights"),
  ]);

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("windowNote")}</p>
    </div>
  );

  if (!insights.hasEnoughData) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<ChartLineUp className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      </div>
    );
  }

  // Formatted here on the server (Intl output differs between Node and the browser).
  const weekLabels = insights.consistency.weeks.map((week) =>
    week.partial ? t("thisWeek") : formatShortDate(week.weekStart, locale)
  );

  return (
    <div className="space-y-6">
      {header}
      {insights.deload.signal && <DeloadBanner deload={insights.deload} />}
      <MuscleVolumeCard volume={insights.muscleVolume} />
      <TrendsCard trends={insights.trends} />
      <ConsistencyCard consistency={insights.consistency} weekLabels={weekLabels} />
    </div>
  );
}
