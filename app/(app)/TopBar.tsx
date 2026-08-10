"use client";

import { usePathname, useRouter } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { LogoutButton } from "./LogoutButton";

const TOP_LEVEL_ROUTES = new Set(["/dashboard", "/routines", "/exercises", "/history", "/log"]);

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL_ROUTES.has(pathname);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center justify-between bg-background/95 px-2 backdrop-blur">
      {isTopLevel ? (
        <span />
      ) : (
        <IconButton
          icon={<CaretLeft className="h-5 w-5" />}
          aria-label="Go back"
          onClick={() => router.back()}
        />
      )}
      {isTopLevel ? <LogoutButton /> : <span />}
    </div>
  );
}
