"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { NotePencil } from "@phosphor-icons/react/ssr";
import { updateSessionNotes } from "@/lib/actions/sessions";
import { Card } from "@/components/ui/Card";

const MAX_NOTES = 500;

// Free-text notes for the workout (how it felt, machine settings…). Collapsed behind an
// "Add a note" button until used; saves on blur when the text changed.
export function SessionNotes({
  sessionId,
  initialNotes,
}: {
  sessionId: string;
  initialNotes: string | null;
}) {
  const t = useTranslations("log");
  const fieldId = useId();
  const [open, setOpen] = useState(Boolean(initialNotes));
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    if (value === saved) return;
    setStatus("saving");
    try {
      await updateSessionNotes(sessionId, value);
      setSaved(value);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-medium text-muted [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <NotePencil className="h-4 w-4" />
        {t("addNote")}
      </button>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
          {t("notes")}
        </label>
        <span className="text-xs text-muted" aria-live="polite">
          {status === "saving" && t("saving")}
          {status === "saved" && t("saved")}
          {status === "error" && (
            <span className="text-danger">{t("saveNoteFailed")}</span>
          )}
        </span>
      </div>
      <textarea
        id={fieldId}
        value={value}
        maxLength={MAX_NOTES}
        rows={3}
        autoFocus={!initialNotes}
        placeholder={t("notesPlaceholder")}
        onChange={(e) => {
          setValue(e.target.value);
          if (status !== "idle") setStatus("idle");
        }}
        onBlur={save}
        className="w-full resize-y rounded-lg border border-border bg-surface-muted px-3 py-2 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="self-end text-xs text-muted tabular-nums">
        {value.length}/{MAX_NOTES}
      </span>
    </Card>
  );
}
