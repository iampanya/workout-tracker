import { useFormatter, useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { muscleLabel, muscleStyle } from "@/components/ui/muscle";
import { HIGH_SETS, LOW_SETS, type MuscleVolume, type VolumeBand } from "@/lib/insights/analysis";

const BAND_TONE: Record<VolumeBand, BadgeTone> = { low: "danger", optimal: "success", high: "neutral" };
// Bars are drawn on a 0–25 sets/week scale; the shaded strip marks the recommended band.
const SCALE_MAX = 25;
const pct = (sets: number) => `${Math.min(sets / SCALE_MAX, 1) * 100}%`;

export function MuscleVolumeCard({ volume }: { volume: MuscleVolume[] }) {
  const t = useTranslations("insights");
  const tm = useTranslations("muscle");
  const format = useFormatter();
  const one = (n: number) => format.number(n, { maximumFractionDigits: 1 });

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("volumeTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t("volumeHint", { low: LOW_SETS, high: HIGH_SETS })}</p>
        <ul className="space-y-3">
          {volume.map((v) => (
            <li key={v.group} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{muscleLabel(tm, v.group)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-muted">
                    {t("setsPerWeek", { sets: one(v.setsPerWeek) })}
                  </span>
                  <Badge tone={BAND_TONE[v.band]}>{t(`band.${v.band}`)}</Badge>
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div
                  className="absolute inset-y-0 bg-success/20"
                  style={{ left: pct(LOW_SETS), width: `calc(${pct(HIGH_SETS)} - ${pct(LOW_SETS)})` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${muscleStyle(v.group).bar}`}
                  style={{ width: pct(v.setsPerWeek) }}
                />
              </div>
              <p className="text-xs text-muted">{t("sessionsPerWeek", { count: one(v.sessionsPerWeek) })}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
