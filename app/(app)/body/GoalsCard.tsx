"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PencilSimple, Sparkle, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { saveBodyGoals } from "@/lib/actions/body";
import { METRIC_UNITS } from "@/lib/body/metrics";
import type { GoalMetric } from "@/lib/body/schema";
import type { BodyGoal } from "@/lib/body/service";
import { GoalProgress } from "./GoalProgress";

type FatMetric = "body_fat_pct" | "body_fat_kg";
const FAT_METRICS: FatMetric[] = ["body_fat_pct", "body_fat_kg"];
type Draft = { weight_kg: string; fat: string; fatMetric: FatMetric; skeletal_muscle_kg: string };

function toDraft(goals: BodyGoal[]): Draft {
  const find = (metric: GoalMetric) => goals.find((g) => g.metric === metric);
  const fat = find("body_fat_pct") ?? find("body_fat_kg");
  return {
    weight_kg: find("weight_kg")?.target.toString() ?? "",
    fat: fat?.target.toString() ?? "",
    fatMetric: (fat?.metric as FatMetric | undefined) ?? "body_fat_pct",
    skeletal_muscle_kg: find("skeletal_muscle_kg")?.target.toString() ?? "",
  };
}

// A blank field means "no goal". Anything unparsable reaches the server schema and is rejected.
function toGoals(draft: Draft): { metric: GoalMetric; target: number }[] {
  const fields: [GoalMetric, string][] = [
    ["weight_kg", draft.weight_kg],
    [draft.fatMetric, draft.fat],
    ["skeletal_muscle_kg", draft.skeletal_muscle_kg],
  ];
  return fields.filter(([, value]) => value.trim() !== "").map(([metric, value]) => ({ metric, target: Number(value) }));
}

export function GoalsCard({
  goals,
  current,
  suggestion,
}: {
  goals: BodyGoal[];
  current: Record<GoalMetric, number | null>;
  suggestion: Partial<Record<GoalMetric, number>>;
}) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(goals));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSuggestion = Object.keys(suggestion).length > 0;

  function openEditor() {
    setDraft(toDraft(goals));
    setError(null);
    setOpen(true);
  }

  function applySuggestion() {
    setDraft((d) => ({
      weight_kg: suggestion.weight_kg?.toString() ?? d.weight_kg,
      fat: suggestion.body_fat_kg?.toString() ?? d.fat,
      fatMetric: suggestion.body_fat_kg !== undefined ? "body_fat_kg" : d.fatMetric,
      skeletal_muscle_kg: suggestion.skeletal_muscle_kg?.toString() ?? d.skeletal_muscle_kg,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveBodyGoals(toGoals(draft));
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("body.saveGoals"));
    } finally {
      setSaving(false);
    }
  }

  const numberProps = { type: "number", inputMode: "decimal", step: "0.1", min: "0", placeholder: t("goalNone") } as const;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("goals")}</h2>
        <Button variant="ghost" icon={<PencilSimple className="h-4 w-4" />} onClick={openEditor}>
          {t("editGoals")}
        </Button>
      </div>
      <Card className="space-y-4">
        {goals.length === 0 ? (
          <p className="text-sm text-muted">{t("goalsEmpty")}</p>
        ) : (
          goals.map((goal) => (
            <GoalProgress
              key={goal.metric}
              label={t(`metrics.${goal.metric}`)}
              unit={METRIC_UNITS[goal.metric]}
              start={goal.start_value}
              target={goal.target}
              current={current[goal.metric]}
            />
          ))
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {t("goalsTitle")}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} aria-label={tc("dismiss")} onClick={() => setOpen(false)} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {hasSuggestion && (
            <Button variant="secondary" icon={<Sparkle className="h-4 w-4" />} onClick={applySuggestion}>
              {t("useSuggestion")}
            </Button>
          )}
          <Input
            label={`${t("metrics.weight_kg")} (kg)`}
            {...numberProps}
            value={draft.weight_kg}
            onChange={(e) => setDraft((d) => ({ ...d, weight_kg: e.target.value }))}
          />
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("fatGoalMetric")}</span>
            <div role="radiogroup" aria-label={t("fatGoalMetric")} className="flex gap-1 rounded-xl bg-surface-muted p-1">
              {FAT_METRICS.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  role="radio"
                  aria-checked={draft.fatMetric === metric}
                  onClick={() => setDraft((d) => ({ ...d, fatMetric: metric }))}
                  className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    draft.fatMetric === metric ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  {t(`metrics.${metric}`)}
                </button>
              ))}
            </div>
            <Input
              label={`${t(`metrics.${draft.fatMetric}`)} (${METRIC_UNITS[draft.fatMetric]})`}
              {...numberProps}
              value={draft.fat}
              onChange={(e) => setDraft((d) => ({ ...d, fat: e.target.value }))}
            />
          </div>
          <Input
            label={`${t("metrics.skeletal_muscle_kg")} (kg)`}
            {...numberProps}
            value={draft.skeletal_muscle_kg}
            onChange={(e) => setDraft((d) => ({ ...d, skeletal_muscle_kg: e.target.value }))}
          />
          <p className="text-xs text-muted">{t("goalsHelp")}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={handleSave} loading={saving}>
            {tc("save")}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
