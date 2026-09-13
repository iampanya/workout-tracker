"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Barbell, GoogleLogo } from "@phosphor-icons/react/ssr";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function LoginCard() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "Sign-in failed. Please try again." : null
  );

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates to Google, so we only reach here on failure.
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Log in</h1>
          <p className="text-sm text-muted">Continue with your Google account.</p>
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
          Continue with Google
        </Button>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold text-foreground hover:opacity-90"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Barbell className="h-5 w-5" weight="bold" />
        </span>
        Weight Training Tracker
      </Link>
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
