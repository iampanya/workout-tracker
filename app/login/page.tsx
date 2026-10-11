"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Barbell, GoogleLogo } from "@phosphor-icons/react/ssr";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LanguageToggleButton } from "@/components/theme/LanguageToggleButton";

function LoginCard() {
  const t = useTranslations("login");
  const te = useTranslations("errors");
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? te("signIn") : null
  );

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    // Redirects to Google; Auth.js handles the callback at /api/auth/callback/google.
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          type="button"
          variant="primary"
          icon={<GoogleLogo className="h-4 w-4" weight="bold" />}
          loading={loading}
          onClick={handleGoogleLogin}
          className="w-full"
        >
          {t("continueWithGoogle")}
        </Button>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  const tc = useTranslations("common");
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute right-4 top-4">
        <LanguageToggleButton />
      </div>
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold text-foreground hover:opacity-90"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Barbell className="h-5 w-5" weight="bold" />
        </span>
        {tc("appName")}
      </Link>
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
