"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { FileArrowUp, UploadSimple, X } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { importBodyScans } from "@/lib/actions/body";
import { toScanDateString } from "@/lib/body/metrics";
import { parseBodyImportText, type BodyImportFile } from "@/lib/body/schema";
import { formatShortDate } from "@/lib/sessions/summary";

// Paste (or pick) the import JSON → validate + preview with the same zod schema the server uses
// → save. The preview only renders after user input, so client-side date formatting can't cause
// a hydration mismatch.
export function ImportScanSheet({
  existingMeasuredAt,
  variant = "secondary",
}: {
  existingMeasuredAt: string[];
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BodyImportFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const existing = new Set(existingMeasuredAt);
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });

  function close() {
    setOpen(false);
    setText("");
    setPreview(null);
    setError(null);
  }

  function check(raw: string) {
    setText(raw);
    if (raw.trim() === "") {
      setPreview(null);
      setError(null);
      return;
    }
    const result = parseBodyImportText(raw);
    setPreview(result.ok ? result.data : null);
    setError(result.ok ? null : te(`body.${result.code}`));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (file) check(await file.text());
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const result = await importBodyScans(preview);
      if (result.error) {
        setError(te(`body.${result.error}`));
        return;
      }
      close();
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("body.importFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant={variant} icon={<UploadSimple className="h-5 w-5" />} onClick={() => setOpen(true)}>
        {t("importButton")}
      </Button>

      <Sheet open={open} onClose={close} labelledBy={titleId}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {t("importTitle")}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} aria-label={tc("dismiss")} onClick={close} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted">{t("importHelp")}</p>
          <textarea
            aria-label={t("importPlaceholder")}
            placeholder={t("importPlaceholder")}
            value={text}
            onChange={(e) => check(e.target.value)}
            spellCheck={false}
            className="min-h-40 w-full rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="secondary"
            icon={<FileArrowUp className="h-5 w-5" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("importPickFile")}
          </Button>

          {error && <p className="text-sm text-danger">{error}</p>}

          {preview && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("importPreview")}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {preview.scans.map((scan, index) => {
                  const instant = new Date(scan.measured_at);
                  return (
                    <li key={`${scan.measured_at}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {formatShortDate(toScanDateString(instant), locale)}
                        </span>
                        <span className="block truncate text-muted">
                          {n(scan.weight_kg)} kg
                          {scan.body_fat_pct != null && ` · ${n(scan.body_fat_pct)}%`}
                          {scan.skeletal_muscle_kg != null && ` · ${n(scan.skeletal_muscle_kg)} kg`}
                        </span>
                      </span>
                      {existing.has(instant.toISOString()) && <Badge>{t("importReplaces")}</Badge>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={handleSave} loading={saving} disabled={!preview}>
            {preview ? t("importConfirm", { count: preview.scans.length }) : t("importButton")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
