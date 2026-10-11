"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react/ssr";
import { deleteRoutine } from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteRoutineButton({
  routineId,
  routineName,
}: {
  routineId: string;
  routineName: string;
}) {
  const t = useTranslations("routines");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteRoutine(routineId);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError(te("deleteRoutine"));
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
        description={t("deleteDescription", { name: routineName })}
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
