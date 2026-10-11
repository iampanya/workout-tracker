"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react/ssr";
import { discardSession } from "@/lib/actions/sessions";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscard() {
    setPending(true);
    setError(null);
    try {
      await discardSession(sessionId);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError(te("discardWorkout"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash className="h-4 w-4" />}
        aria-label={t("discardLabel")}
        variant="danger"
        onClick={() => setConfirmOpen(true)}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={t("discardTitle")}
        description={t("discardDescription")}
        confirmLabel={t("discard")}
        cancelLabel={tc("keepGoing")}
        tone="danger"
        loading={pending}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
