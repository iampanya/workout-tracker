import { useFormatter, useTranslations } from "next-intl";
import { StatCard } from "@/components/ui/StatCard";
import { METRIC_UNITS, scanDelta } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";
import type { BodyScan } from "@/lib/body/service";
import { DeltaBadge } from "./DeltaBadge";

const SNAPSHOT_METRICS: ScanMetricKey[] = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "visceral_fat"];

export function LatestSnapshot({ latest, previous }: { latest: BodyScan; previous: BodyScan | null }) {
  const t = useTranslations("body");
  const format = useFormatter();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SNAPSHOT_METRICS.map((metric) => {
        const value = latest[metric];
        return (
          <StatCard
            key={metric}
            label={t(`metrics.${metric}`)}
            value={value === null ? "–" : format.number(value, { maximumFractionDigits: 2 })}
            unit={METRIC_UNITS[metric] || undefined}
            badge={<DeltaBadge metric={metric} delta={previous ? scanDelta(value, previous[metric]) : null} />}
          />
        );
      })}
    </div>
  );
}
