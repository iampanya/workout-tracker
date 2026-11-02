import Link from "next/link";
import { useTranslations } from "next-intl";
import { CaretRight, ChartLineUp } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import type { Insights } from "@/lib/insights/analysis";

const LINK_CLASS =
  "flex items-center gap-3 rounded-2xl p-4 transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The phone's way into /insights (it has no bottom-nav tab), so it's shown even without data.
export function InsightsCard({ insights }: { insights: Insights }) {
  const t = useTranslations("dashboard");
  const deload = insights.hasEnoughData && insights.deload.signal;
  const text = !insights.hasEnoughData
    ? t("insightsEmpty")
    : deload
      ? t("insightsDeload")
      : t("insightsSummary", {
          plateaus: insights.trends.filter((trend) => trend.status === "plateau").length,
          low: insights.muscleVolume.filter((v) => v.band === "low").length,
        });

  return (
    <Card padding={false}>
      <Link href="/insights" className={LINK_CLASS}>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            deload ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
          }`}
        >
          <ChartLineUp className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-sm">{text}</span>
        <CaretRight className="h-4 w-4 shrink-0 text-muted" />
      </Link>
    </Card>
  );
}
