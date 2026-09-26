"use client";

import { Play } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { useStartSession } from "../log/useStartSession";

// Starts a workout from a routine right where it's listed (routines index / editor).
export function StartRoutineButton({
  routine,
  size = "md",
  compact = false,
  className = "",
}: {
  routine: { id: string; name: string };
  size?: "md" | "lg";
  // Icon-only on phones (label from sm up) so a list row keeps room for the routine preview.
  compact?: boolean;
  className?: string;
}) {
  const { start, pendingKey, error } = useStartSession();
  return (
    <div className={className}>
      <Button
        variant="primary"
        size={size}
        icon={<Play className="h-4 w-4" weight="fill" />}
        loading={pendingKey !== null}
        onClick={() => start(routine)}
        aria-label={`Start ${routine.name}`}
        className={compact ? "w-full px-3 sm:px-4" : "w-full"}
      >
        {compact ? <span className="hidden sm:inline">Start</span> : "Start"}
      </Button>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
