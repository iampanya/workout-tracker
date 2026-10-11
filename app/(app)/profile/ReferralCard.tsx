"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ArrowsClockwise, UsersThree } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { regenerateReferralCodeAction } from "@/lib/actions/referrals";

type ReferralCardProps = {
  code: string;
  invitedCount: number;
  /** Absolute origin (e.g. https://app.example.com) computed server-side. */
  origin: string;
};

export function ReferralCard({ code, invitedCount, origin }: ReferralCardProps) {
  const t = useTranslations("profile");
  const te = useTranslations("errors");
  const [currentCode, setCurrentCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = `${origin}/signup?invite=${currentCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(te("copyLink"));
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    const result = await regenerateReferralCodeAction();
    setRegenerating(false);
    setConfirmOpen(false);
    if (result.error || !result.code) {
      setError(te(`referral.${result.error ?? "regenerateFailed"}`));
      return;
    }
    setCurrentCode(result.code);
    setCopied(false);
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

      <div className="flex items-center gap-2 text-sm text-muted">
        <UsersThree className="h-4 w-4" weight="bold" />
        <span>
          {t.rich("invited", {
            count: invitedCount,
            b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
          })}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted">{t("linkLeaked")}</span>
        <Button
          variant="danger"
          icon={<ArrowsClockwise className="h-4 w-4" />}
          onClick={() => setConfirmOpen(true)}
        >
          {t("regenerate")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("regenerateTitle")}
        description={t("regenerateDescription")}
        confirmLabel={t("regenerate")}
        tone="danger"
        loading={regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
