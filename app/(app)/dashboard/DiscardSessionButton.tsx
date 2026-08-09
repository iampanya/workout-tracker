"use client";

import { useState } from "react";
import { discardSession } from "@/lib/actions/sessions";

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
      <button
        onClick={handleDiscard}
        disabled={pending}
        className="text-sm text-gray-500 underline disabled:opacity-50"
      >
        {pending ? "Discarding..." : "Discard"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
