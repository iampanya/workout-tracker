"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { discardSession } from "@/lib/actions/sessions";
import { IconButton } from "@/components/ui/IconButton";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscard() {
    setPending(true);
    setError(null);
    try {
      await discardSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard session");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash2 className="h-4 w-4" />}
        aria-label="Discard session"
        variant="danger"
        loading={pending}
        onClick={handleDiscard}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
