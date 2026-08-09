"use client";

import { discardSession } from "@/lib/actions/sessions";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  return (
    <button onClick={() => discardSession(sessionId)} className="text-sm text-gray-500 underline">
      Discard
    </button>
  );
}
