import Link from "next/link";
import { Barbell } from "@phosphor-icons/react/ssr";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Barbell className="h-5 w-5" weight="bold" />
          </span>
          <span className="hidden sm:inline">Weight Training Tracker</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
