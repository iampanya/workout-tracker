"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretLeft, User } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";
import { LogoutButton } from "./LogoutButton";

const TOP_LEVEL_ROUTES = new Set(["/dashboard", "/routines", "/exercises", "/history", "/log"]);

export function TopBar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL_ROUTES.has(pathname);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center justify-between bg-background/95 px-2 backdrop-blur">
      {isTopLevel ? (
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <User className="h-4 w-4" />
          {username}
        </Link>
      ) : (
        <IconButton
          icon={<CaretLeft className="h-5 w-5" />}
          aria-label="Go back"
          onClick={() => router.back()}
        />
      )}
      {isTopLevel ? (
        <div className="flex items-center">
          <ThemeToggleButton />
          <LogoutButton />
        </div>
      ) : (
        <ThemeToggleButton />
      )}
    </div>
  );
}
