"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretLeft, Barbell } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { AccountMenu } from "./AccountMenu";

const TOP_LEVEL_ROUTES = new Set(["/dashboard", "/routines", "/exercises", "/history", "/log"]);

export function TopBar({ username, email }: { username: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL_ROUTES.has(pathname);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center justify-between bg-background/95 px-2 backdrop-blur">
      {isTopLevel ? (
        <Link
          href="/dashboard"
          aria-label="Weight Training Tracker home"
          className="flex items-center gap-2 rounded-lg px-1 py-1 font-semibold text-foreground transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Barbell className="h-4 w-4" weight="bold" />
          </span>
          <span className="hidden text-sm sm:inline">Weight Training Tracker</span>
        </Link>
      ) : (
        <IconButton
          icon={<CaretLeft className="h-5 w-5" />}
          aria-label="Go back"
          onClick={() => router.back()}
        />
      )}
      <AccountMenu username={username} email={email} />
    </div>
  );
}
