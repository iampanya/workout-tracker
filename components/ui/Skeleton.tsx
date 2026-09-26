// Placeholder blocks for route loading.tsx files: they reserve roughly the final layout so
// the page doesn't jump when data arrives. Pulses only when the user allows motion.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-2xl bg-surface-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

// Generic page skeleton: a title, optional stat tiles, then a stack of card rows.
export function PageSkeleton({
  tiles = 0,
  rows = 4,
  rowClassName = "h-20",
}: {
  tiles?: number;
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <Skeleton className="h-8 w-40 rounded-lg" />
      {tiles > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: tiles }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={rowClassName} />
        ))}
      </div>
    </div>
  );
}
