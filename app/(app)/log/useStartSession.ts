"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getLocalDateString } from "@/lib/date";
import { startSession } from "@/lib/actions/sessions";

// Starts a session (from a routine, or freeform) and opens it. Only one start at a time:
// `pendingKey` names the routine being started (or "freeform") so callers can disable every
// start button while one is in flight — a double tap can't create two sessions. It stays set
// on success because we're navigating away.
export function useStartSession() {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // State updates land on the next render, so two clicks in the same tick would both see
  // pendingKey === null; the ref closes that gap.
  const inFlight = useRef(false);

  async function start(routine?: { id: string; name: string }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingKey(routine?.id ?? "freeform");
    setError(null);
    try {
      const session = await startSession({
        routineId: routine?.id,
        name: routine?.name,
        sessionDate: getLocalDateString(),
      });
      router.push(`/log/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workout");
      setPendingKey(null);
      inFlight.current = false;
    }
  }

  return { start, pendingKey, error };
}
