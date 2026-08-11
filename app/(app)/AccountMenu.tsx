"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, CaretDown, Gear, SignOut } from "@phosphor-icons/react/ssr";
import { ThemeModeControl } from "@/components/theme/ThemeModeControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function AccountMenu({ username, email }: { username: string; email: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <User className="h-4 w-4" />
        {username}
        <CaretDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-lg"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{username}</p>
            {email && <p className="truncate text-xs text-muted">{email}</p>}
          </div>
          <div className="my-1 h-px bg-border" />

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${ITEM_CLASS} text-foreground hover:bg-surface-muted`}
          >
            <User className="h-4 w-4 text-muted" />
            Profile
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${ITEM_CLASS} text-foreground hover:bg-surface-muted`}
          >
            <Gear className="h-4 w-4 text-muted" />
            Settings
          </Link>

          <div className="my-1 h-px bg-border" />
          <div className="px-2 py-1.5">
            <p className="mb-1.5 px-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Theme
            </p>
            <ThemeModeControl />
          </div>
          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmLogout(true);
            }}
            className={`${ITEM_CLASS} text-danger hover:bg-danger/10`}
          >
            <SignOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        description="You'll need to sign in with your username again to get back in."
        confirmLabel="Log out"
        tone="danger"
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
