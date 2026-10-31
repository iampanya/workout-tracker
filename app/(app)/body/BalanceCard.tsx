import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import {
  BODY_REGIONS,
  leanShare,
  limbImbalancePct,
  trainingShare,
  type BodyRegion,
  type RegionShare,
} from "@/lib/body/balance";
import type { BodySegments } from "@/lib/body/schema";

// Full static class names (Tailwind can't see `bg-muscle-${x}`). Trunk uses the core color.
const REGION_BG: Record<BodyRegion, string> = {
  arms: "bg-muscle-arms",
  trunk: "bg-muscle-core",
  legs: "bg-muscle-legs",
};

function ShareBar({ label, share }: { label: string; share: RegionShare }) {
  const t = useTranslations("body");
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted">
        {BODY_REGIONS.map((region) => (
          <div key={region} className={REGION_BG[region]} style={{ width: `${share[region]}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {BODY_REGIONS.map((region) => (
          <span key={region} className="flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${REGION_BG[region]}`} />
            {t(`regions.${region}`)} {share[region]}%
          </span>
        ))}
      </div>
    </div>
  );
}

function LimbRow({ label, left, right }: { label: string; left: number; right: number }) {
  const t = useTranslations("body");
  const format = useFormatter();
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs tabular-nums text-muted">
        {t("left")} {n(left)} kg · {t("right")} {n(right)} kg ·{" "}
        {t("difference", { pct: n(limbImbalancePct(left, right) ?? 0) })}
      </span>
    </div>
  );
}

// Informational only: sets aren't recorded per side, so L/R can't be tied to training — only the
// arms/trunk/legs split can.
export function BalanceCard({
  segments,
  setCounts,
}: {
  segments: BodySegments | null;
  setCounts: { muscle_group: string | null; sets: number }[];
}) {
  const t = useTranslations("body");
  const lean = leanShare(segments);
  const training = trainingShare(setCounts);
  const limbs = [
    { label: t("regions.arms"), left: segments?.left_arm?.lean_kg, right: segments?.right_arm?.lean_kg },
    { label: t("regions.legs"), left: segments?.left_leg?.lean_kg, right: segments?.right_leg?.lean_kg },
  ].flatMap(({ label, left, right }) =>
    left != null && right != null && limbImbalancePct(left, right) !== null ? [{ label, left, right }] : []
  );
  if (!lean && limbs.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("balance")}</h2>
      <Card className="space-y-5">
        {limbs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm text-muted">{t("leftRight")}</h3>
            {limbs.map((limb) => (
              <LimbRow key={limb.label} {...limb} />
            ))}
          </div>
        )}
        {lean && (
          <div className="space-y-3">
            <h3 className="text-sm text-muted">{t("regionShare")}</h3>
            <ShareBar label={t("leanShareLabel")} share={lean} />
            {training ? (
              <ShareBar label={t("trainingShareLabel")} share={training} />
            ) : (
              <p className="text-sm text-muted">{t("noTrainingSets")}</p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
