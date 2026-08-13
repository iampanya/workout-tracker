"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretLeft, Barbell, Plus } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { AccountMenu } from "./AccountMenu";
import { NAV_ITEMS } from "./nav-items";

const TOP_LEVEL_ROUTES = new Set(["/dashboard", "/routines", "/exercises", "/history", "/log"]);

export function TopBar({
  username,
  email,
  resumeSessionId,
}: {
  username: string;
  email: string;
  resumeSessionId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL_ROUTES.has(pathname);
  const fabHref = resumeSessionId ? `/log/${resumeSessionId}` : "/log";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 lg:h-16 lg:px-6">
        <div className="flex items-center gap-1 lg:gap-2">
          {!isTopLevel && (
            <IconButton
              icon={<CaretLeft className="h-5 w-5" />}
              aria-label="Go back"
              onClick={() => router.back()}
              className="lg:hidden"
            />
          )}
          <Link
            href="/"
            aria-label="Weight Training Tracker landing page"
            className={`items-center gap-2 rounded-lg px-1 py-1 font-semibold text-foreground transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isTopLevel ? "flex" : "hidden lg:flex"
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Barbell className="h-5 w-5" weight="bold" />
            </span>
            <span className="hidden text-sm sm:inline">Weight Training Tracker</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" weight={active ? "fill" : "regular"} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={fabHref}
            className="hidden min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:inline-flex"
          >
            <Plus className="h-4 w-4" weight="bold" />
            Log workout
          </Link>
          <AccountMenu username={username} email={email} />
        </div>
      </div>
    </header>
  );
}
