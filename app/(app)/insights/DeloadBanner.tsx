import { useTranslations } from "next-intl";
import { BatteryWarning } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import type { DeloadSignal } from "@/lib/insights/analysis";

export function DeloadBanner({ deload }: { deload: DeloadSignal }) {
  const t = useTranslations("insights");
  return (
    <Card className="flex gap-3 border-danger/40 bg-danger/10">
      <BatteryWarning className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
      <div className="space-y-1 text-sm">
        <p className="font-medium text-foreground">{t("deloadTitle")}</p>
        <p className="text-muted">
          {t("deloadDescription", { declining: deload.declining, scored: deload.scored })}
        </p>
        {deload.weeksSinceLightWeek !== 0 && (
          <p className="text-muted">
            {deload.weeksSinceLightWeek === null
              ? t("deloadNoLightWeek")
              : t("deloadSinceLight", { weeks: deload.weeksSinceLightWeek })}
          </p>
        )}
      </div>
    </Card>
  );
}
