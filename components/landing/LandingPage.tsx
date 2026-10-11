import Link from "next/link";
import { useTranslations } from "next-intl";
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
  { key: "fastLogging", icon: <Lightning className="h-5 w-5" weight="bold" /> },
  { key: "overload", icon: <TrendUp className="h-5 w-5" weight="bold" /> },
  { key: "prs", icon: <Trophy className="h-5 w-5" weight="bold" /> },
  { key: "charts", icon: <ChartLine className="h-5 w-5" weight="bold" /> },
] as const;

const STEPS = ["1", "2", "3"] as const;

export function LandingPage({ authed = false }: { authed?: boolean }) {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const primaryCta = authed
    ? { href: "/dashboard", label: t("goToDashboard") }
    : { href: "/login", label: t("logIn") };

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
              {t("badge")}
            </Badge>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t("headline")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{t("subhead")}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={primaryCta.href}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
              >
                <Play className="h-5 w-5" weight="fill" />
                {primaryCta.label}
              </Link>
            </div>
          </div>

          {/* Product preview built from real primitives */}
          <div className="landing-fade-up mx-auto max-w-3xl pb-8" style={{ animationDelay: "80ms" }}>
            <Card className="bg-surface-muted">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
                <Barbell className="h-4 w-4" weight="bold" />
                {t("previewThisWeek")}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label={t("previewWorkouts")} value="4" />
                <StatCard label={t("previewVolume")} value="12,480" unit="kg" />
                <StatCard
                  label={t("previewNewPrs")}
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
              <Card key={f.key} className="flex flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  {f.icon}
                </span>
                <h3 className="font-semibold text-foreground">{t(`${f.key}Title`)}</h3>
                <p className="text-sm text-muted">{t(`${f.key}Body`)}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-12">
          <h2 className="text-center text-2xl font-semibold text-foreground">{t("howItWorks")}</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((n) => (
              <Card key={n} className="flex flex-col gap-2">
                <span className="font-mono text-3xl font-bold text-accent">{n}</span>
                <h3 className="font-semibold text-foreground">{t(`step${n}Title`)}</h3>
                <p className="text-sm text-muted">{t(`step${n}Body`)}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-12">
          <div className="rounded-2xl bg-surface-muted px-6 py-12 text-center">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              {t("ctaTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted">{t("ctaBody")}</p>
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
            {tc("appName")}
          </span>
          <span>{t("footer", { year: String(new Date().getFullYear()) })}</span>
        </div>
      </footer>
    </div>
  );
}
