"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CaretDown, CaretUp, PencilSimple, Plus, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { saveManualBodyScan } from "@/lib/actions/body";
import { fromZonedDateTimeInput, toZonedDateTimeInput } from "@/lib/date";
import { MANUAL_MAIN_KEYS, MANUAL_MORE_KEYS } from "@/lib/body/manual";
import { METRIC_UNITS } from "@/lib/body/metrics";
import type { BodyScan } from "@/lib/body/service";

type ManualKey = (typeof MANUAL_MAIN_KEYS)[number] | (typeof MANUAL_MORE_KEYS)[number];
type Draft = { measuredAt: string; values: Partial<Record<ManualKey, string>> };

function toDraft(scan: BodyScan | undefined): Draft {
  const values: Draft["values"] = {};
  for (const key of [...MANUAL_MAIN_KEYS, ...MANUAL_MORE_KEYS]) {
    const value = scan?.[key];
    if (value != null) values[key] = String(value);
  }
  return { measuredAt: toZonedDateTimeInput(scan ? new Date(scan.measured_at) : new Date()), values };
}

// Blank = not measured. Anything unparsable reaches the server schema and comes back "invalid".
const toNumber = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : Number(value));

// Type a scan in by hand (no arboleaf scale): the four snapshot values up front, the rest behind
// "More values". With `scan` it edits that manual scan instead. Values and times are only built
// in the open handler, so nothing here is formatted during SSR.
export function ManualScanSheet({
  scan,
  latestWeight = null,
  variant = "secondary",
}: {
  scan?: BodyScan;
  latestWeight?: number | null;
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ measuredAt: "", values: {} });
  const [maxMeasuredAt, setMaxMeasuredAt] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weight = toNumber(draft.values.weight_kg);
  const fatPct = toNumber(draft.values.body_fat_pct);
  const derivedFatKg =
    weight !== null && fatPct !== null && weight > 0 && fatPct >= 0 ? (weight * fatPct) / 100 : null;
  const measuredAtIso = fromZonedDateTimeInput(draft.measuredAt);
  const canSave = weight !== null && weight > 0 && measuredAtIso !== null;

  function openSheet() {
    const next = toDraft(scan);
    setDraft(next);
    setMaxMeasuredAt(toZonedDateTimeInput(new Date()));
    setShowMore(MANUAL_MORE_KEYS.some((key) => next.values[key] !== undefined));
    setError(null);
    setOpen(true);
  }

  function setValue(key: ManualKey, value: string) {
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const input: Record<string, unknown> = { measured_at: measuredAtIso };
      for (const key of [...MANUAL_MAIN_KEYS, ...MANUAL_MORE_KEYS]) input[key] = toNumber(draft.values[key]);
      const result = await saveManualBodyScan(input, scan?.id);
      if (result.error) {
        setError(te(`body.${result.error}`));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("body.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function field(key: ManualKey) {
    // Percentage labels already say "%".
    const unit = METRIC_UNITS[key];
    return (
      <Input
        key={key}
        label={unit && unit !== "%" ? `${t(`metrics.${key}`)} (${unit})` : t(`metrics.${key}`)}
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        required={key === "weight_kg"}
        placeholder={key === "weight_kg" && latestWeight !== null ? String(latestWeight) : undefined}
        value={draft.values[key] ?? ""}
        onChange={(e) => setValue(key, e.target.value)}
      />
    );
  }

  return (
    <>
      {scan ? (
        <IconButton icon={<PencilSimple className="h-4 w-4" />} aria-label={t("editLabel")} onClick={openSheet} />
      ) : (
        <Button variant={variant} icon={<Plus className="h-5 w-5" />} onClick={openSheet}>
          {t("manualButton")}
        </Button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {scan ? t("manualEditTitle") : t("manualTitle")}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} aria-label={tc("dismiss")} onClick={() => setOpen(false)} />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Input
            label={t("measuredAt")}
            type="datetime-local"
            required
            max={maxMeasuredAt}
            value={draft.measuredAt}
            onChange={(e) => setDraft((d) => ({ ...d, measuredAt: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-3">{MANUAL_MAIN_KEYS.map(field)}</div>
          {derivedFatKg !== null && (
            <p className="text-xs text-muted">
              {t("fatKgDerived", { value: format.number(derivedFatKg, { maximumFractionDigits: 2 }) })}
            </p>
          )}

          <Button
            variant="ghost"
            icon={showMore ? <CaretUp className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? t("fewerValues") : t("moreValues")}
          </Button>
          {showMore && <div className="grid grid-cols-2 gap-3">{MANUAL_MORE_KEYS.map(field)}</div>}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={handleSave} loading={saving} disabled={!canSave}>
            {tc("save")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
