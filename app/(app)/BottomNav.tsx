"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play, Plus } from "@phosphor-icons/react/ssr";
import { NAV_ITEMS } from "./nav-items";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof NAV_ITEMS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-xs [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <Icon className="h-5 w-5" weight={active ? "fill" : "regular"} />
      {label}
    </Link>
  );
}

export function BottomNav({ resumeSessionId }: { resumeSessionId: string | null }) {
  const pathname = usePathname();
  const resuming = resumeSessionId !== null;
  const fabHref = resuming ? `/log/${resumeSessionId}` : "/log";
  // On the logging screen itself the FAB would point at the current page and cover the
  // screen's own sticky action bar, so it's hidden there.
  const onLoggingScreen = pathname.startsWith("/log/");
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {/* Five slots: two links, the centre slot reserved for the log FAB, two links — so no
          label ever sits under the FAB. */}
      <div className="grid grid-cols-5">
        {left.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
        <div className="relative flex min-h-14 flex-col items-center justify-end pb-2 text-xs">
          {!onLoggingScreen && (
            <>
              <Link
                href={fabHref}
                aria-label={resuming ? "Resume workout" : "Log a workout"}
                className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {resuming ? (
                  <Play className="h-6 w-6" weight="fill" />
                ) : (
                  <Plus className="h-6 w-6" weight="bold" />
                )}
                {resuming && (
                  <span
                    aria-hidden
                    className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success motion-safe:animate-pulse"
                  />
                )}
              </Link>
              <span aria-hidden className={resuming ? "font-medium text-accent" : "text-muted"}>
                {resuming ? "Resume" : "Log"}
              </span>
            </>
          )}
        </div>
        {right.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  );
}
