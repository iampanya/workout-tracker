import Link from "next/link";
import {
  Barbell,
  ChartLine,
  Lightning,
  Play,
  TrendUp,
  Trophy,
} from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { LandingNav } from "./LandingNav";

const FEATURES = [
  {
    icon: <Lightning className="h-5 w-5" weight="bold" />,
    title: "Fast set logging",
    body: "Log weight and reps with +/- steppers. No fiddly typing mid-set.",
  },
  {
    icon: <TrendUp className="h-5 w-5" weight="bold" />,
    title: "Progressive overload",
    body: "See last session's numbers inline, so you always know what to beat.",
  },
  {
    icon: <Trophy className="h-5 w-5" weight="bold" />,
    title: "Automatic PRs",
    body: "Your best working set per exercise, tracked live. Warmups excluded.",
  },
  {
    icon: <ChartLine className="h-5 w-5" weight="bold" />,
    title: "Progress charts",
    body: "Weekly training volume and per-exercise trends at a glance.",
  },
];

const STEPS = [
  { n: "1", title: "Pick a routine", body: "Start from a saved routine or go freeform." },
  { n: "2", title: "Log your sets", body: "Tap through weight and reps as you lift." },
  { n: "3", title: "Watch progress", body: "PRs and volume update the moment you finish." },
];

export function LandingPage({ authed = false }: { authed?: boolean }) {
  const primaryCta = authed
    ? { href: "/dashboard", label: "Go to dashboard" }
    : { href: "/login", label: "Log in" };

  return (
    <div className="min-h-screen">
      <LandingNav authed={authed} />

      <main className="mx-auto max-w-5xl px-4">
        {/* Hero */}
        <section className="relative isolate">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 55% at 50% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%), radial-gradient(45% 45% at 85% 20%, color-mix(in oklab, var(--accent-secondary) 14%, transparent), transparent 70%)",
            }}
          />
          <div className="landing-fade-up mx-auto max-w-3xl py-20 text-center sm:py-28">
            <Badge tone="success" icon={<TrendUp className="h-3.5 w-3.5" weight="bold" />}>
              Progressive overload, tracked
            </Badge>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Lift more than last time.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
              A no-nonsense weight-training log. Record every set, watch your PRs
              climb, and never lose track of what to beat.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={primaryCta.href}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
              >
                <Play className="h-5 w-5" weight="fill" />
                {primaryCta.label}
              </Link>
              {!authed && (
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 text-base font-medium text-foreground transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                >
                  Sign up
                </Link>
              )}
            </div>
            {!authed && <p className="mt-3 text-sm text-muted">Sign-up is invite-only.</p>}
          </div>

          {/* Product preview built from real primitives */}
          <div className="landing-fade-up mx-auto max-w-3xl pb-8" style={{ animationDelay: "80ms" }}>
            <Card className="bg-surface-muted">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
                <Barbell className="h-4 w-4" weight="bold" />
                This week
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="Workouts" value="4" />
                <StatCard label="Volume" value="12,480" unit="kg" />
                <StatCard
                  label="New PRs"
                  value="3"
                  tone="success"
                  icon={<Trophy className="h-4 w-4" weight="bold" />}
                />
              </div>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="py-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="flex flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  {f.icon}
                </span>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-12">
          <h2 className="text-center text-2xl font-semibold text-foreground">How it works</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="flex flex-col gap-2">
                <span className="font-mono text-3xl font-bold text-accent">{s.n}</span>
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted">{s.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-12">
          <div className="rounded-2xl bg-surface-muted px-6 py-12 text-center">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Ready to log your next session?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted">
              Pick up where you left off and keep the streak going.
            </p>
            <Link
              href={primaryCta.href}
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Play className="h-5 w-5" weight="fill" />
              {primaryCta.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:flex-row">
          <span className="flex items-center gap-2">
            <Barbell className="h-4 w-4" weight="bold" />
            Weight Training Tracker
          </span>
          <span>All weights in kg &middot; &copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
