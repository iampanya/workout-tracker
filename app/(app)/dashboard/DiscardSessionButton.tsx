"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react/ssr";
import { discardSession } from "@/lib/actions/sessions";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
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
      setError(err instanceof Error ? err.message : "Failed to discard session");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash className="h-4 w-4" />}
        aria-label="Discard session"
        variant="danger"
        onClick={() => setConfirmOpen(true)}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Discard this workout?"
        description="This in-progress workout and any sets logged in it will be permanently deleted."
        confirmLabel="Discard"
        tone="danger"
        loading={pending}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
