"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react/ssr";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { deleteBodyScan } from "@/lib/actions/body";

export function DeleteScanButton({ scanId, dateLabel }: { scanId: string; dateLabel: string }) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteBodyScan(scanId);
      setConfirmOpen(false);
      router.push("/body");
    } catch (err) {
      console.error(err);
      setError(te("body.deleteScan"));
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
        description={t("deleteDescription", { date: dateLabel })}
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
