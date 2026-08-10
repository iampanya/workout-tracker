"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ClipboardText, Barbell, ClockCounterClockwise, Plus } from "@phosphor-icons/react/ssr";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/routines", label: "Routines", icon: ClipboardText },
  { href: "/exercises", label: "Exercises", icon: Barbell },
  { href: "/history", label: "History", icon: ClockCounterClockwise },
] as const;

export function BottomNav({ resumeSessionId }: { resumeSessionId: string | null }) {
  const pathname = usePathname();
  const fabHref = resumeSessionId ? `/log/${resumeSessionId}` : "/log";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="relative grid grid-cols-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs [touch-action:manipulation] ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon className="h-5 w-5" weight={active ? "fill" : "regular"} />
              {label}
            </Link>
          );
        })}
        <Link
          href={fabHref}
          aria-label="Log a workout"
          className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus className="h-6 w-6" weight="bold" />
        </Link>
      </div>
    </nav>
  );
}
