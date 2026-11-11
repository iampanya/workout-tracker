"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretUp, CaretDown, Minus, Plus, X } from "@phosphor-icons/react/ssr";
import {
  removeRoutineExercise,
  moveRoutineExercise,
  updateRoutineExerciseTargetSets,
  updateRoutineExerciseRepRange,
} from "@/lib/actions/routines";
import {
  DEFAULT_REP_RANGE,
  REP_RANGE_PRESETS,
  parseRepRange,
  repRangeValue,
  type RepRange,
} from "@/lib/routines/rep-range";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { muscleLabel } from "@/components/ui/muscle";

type PendingAction = "up" | "down" | "remove" | "target" | "repRange" | null;

const MAX_TARGET_SETS = 20;

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
  muscleGroup,
  targetSets,
  repRange: initialRepRange,
  isFirst,
  isLast,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
  muscleGroup: string | null;
  targetSets: number | null;
  repRange: RepRange | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("routines");
  const tc = useTranslations("common");
  const tm = useTranslations("muscle");
  const te = useTranslations("errors");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Optimistic target so rapid taps feel instant; the server value replaces it on revalidate.
  const [target, setTarget] = useState(targetSets);
  const [repRange, setRepRange] = useState(initialRepRange);
  // Presets, plus the stored range if it isn't one of them.
  const rangeOptions =
    repRange && !REP_RANGE_PRESETS.some((r) => repRangeValue(r) === repRangeValue(repRange))
      ? [...REP_RANGE_PRESETS, repRange]
      : REP_RANGE_PRESETS;

  async function run(
    action: Exclude<PendingAction, null>,
    fn: () => Promise<void>,
    fallbackKey: "moveExercise" | "removeExercise" | "updateTargetSets" | "updateRepRange"
  ) {
    setPending(action);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      console.error(err);
      setError(te(fallbackKey));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function changeTarget(delta: number) {
    const previous = target;
    // Stepping below 1 clears the target ("—"); stepping up from none starts at 1.
    const next =
      previous === null
        ? delta > 0
          ? 1
          : null
        : previous + delta < 1
          ? null
          : Math.min(MAX_TARGET_SETS, previous + delta);
    if (next === previous) return;
    setTarget(next);
    const ok = await run(
      "target",
      () => updateRoutineExerciseTargetSets(routineExerciseId, routineId, next),
      "updateTargetSets"
    );
    if (!ok) setTarget(previous);
  }

  async function changeRepRange(value: string) {
    const previous = repRange;
    const next = parseRepRange(value);
    setRepRange(next);
    const ok = await run(
      "repRange",
      () => updateRoutineExerciseRepRange(routineExerciseId, routineId, next),
      "updateRepRange"
    );
    if (!ok) setRepRange(previous);
  }

  const busy = pending !== null && pending !== "target" && pending !== "repRange";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {muscleGroup && <p className="text-xs text-muted">{muscleLabel(tm, muscleGroup)}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            icon={<CaretUp className="h-4 w-4" />}
            aria-label={t("moveUp", { name })}
            loading={pending === "up"}
            disabled={isFirst || busy}
            onClick={() =>
              run(
                "up",
                () => moveRoutineExercise(routineExerciseId, routineId, "up"),
                "moveExercise"
              )
            }
          />
          <IconButton
            icon={<CaretDown className="h-4 w-4" />}
            aria-label={t("moveDown", { name })}
            loading={pending === "down"}
            disabled={isLast || busy}
            onClick={() =>
              run(
                "down",
                () => moveRoutineExercise(routineExerciseId, routineId, "down"),
                "moveExercise"
              )
            }
          />
          <IconButton
            icon={<X className="h-4 w-4" />}
            aria-label={t("removeLabel", { name })}
            variant="danger"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-sm text-muted">{t("targetSets")}</span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={<Minus className="h-4 w-4" />}
            aria-label={t("fewerTarget", { name })}
            disabled={target === null}
            onClick={() => changeTarget(-1)}
          />
          <span className="w-8 text-center font-mono text-lg tabular-nums" aria-live="polite">
            {target ?? "—"}
          </span>
          <IconButton
            icon={<Plus className="h-4 w-4" />}
            aria-label={t("moreTarget", { name })}
            disabled={target !== null && target >= MAX_TARGET_SETS}
            onClick={() => changeTarget(1)}
          />
        </div>
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <Select
          label={t("repRange")}
          value={repRangeValue(repRange)}
          disabled={pending === "repRange"}
          onChange={(e) => changeRepRange(e.target.value)}
        >
          <option value="">
            {t("repRangeDefault", { min: DEFAULT_REP_RANGE.min, max: DEFAULT_REP_RANGE.max })}
          </option>
          {rangeOptions.map((range) => (
            <option key={repRangeValue(range)} value={repRangeValue(range)}>
              {t("repRangeOption", { min: range.min, max: range.max })}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmRemove}
        title={t("removeTitle")}
        description={t("removeDescription", { name })}
        confirmLabel={tc("remove")}
        tone="danger"
        loading={pending === "remove"}
        onConfirm={async () => {
          const ok = await run(
            "remove",
            () => removeRoutineExercise(routineExerciseId, routineId),
            "removeExercise"
          );
          if (ok) setConfirmRemove(false);
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
