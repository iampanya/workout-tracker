"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, UsersThree } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type ReferralCardProps = {
  invitedCount: number;
  /** Absolute origin (e.g. https://app.example.com) computed server-side. */
  origin: string;
};

// Signup is open (Google sign-in), so the share link is just the public landing page — no invite
// code. `invitedCount` only reflects legacy invite-link signups, so it's shown only when non-zero.
export function ReferralCard({ invitedCount, origin }: ReferralCardProps) {
  const t = useTranslations("profile");
  const te = useTranslations("errors");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = `${origin}/`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(te("copyLink"));
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("inviteFriends")}</span>
        <p className="text-sm text-muted">
          {t("inviteDescription")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
          {link}
        </code>
        <Button
          variant="secondary"
          icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={handleCopy}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>

      {invitedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <UsersThree className="h-4 w-4" weight="bold" />
          <span>
            {t.rich("invited", {
              count: invitedCount,
              b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}
