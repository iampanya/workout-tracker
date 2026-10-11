"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react/ssr";
import { deleteCompletedSession } from "@/lib/actions/sessions";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteHistorySessionButton({
  sessionId,
  sessionName,
}: {
  sessionId: string;
  sessionName: string;
}) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteCompletedSession(sessionId);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError(te("deleteWorkout"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash className="h-4 w-4" />}
        aria-label={t("deleteLabel")}
        variant="danger"
        onClick={() => setConfirmOpen(true)}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: sessionName })}
        confirmLabel={tc("delete")}
        tone="danger"
        loading={pending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
