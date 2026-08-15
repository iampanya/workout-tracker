"use client";

import { useState } from "react";
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
      setError("Couldn't copy — copy the link manually");
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    const result = await regenerateReferralCodeAction();
    setRegenerating(false);
    setConfirmOpen(false);
    if (result.error || !result.code) {
      setError(result.error ?? "Could not regenerate code");
      return;
    }
    setCurrentCode(result.code);
    setCopied(false);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Invite friends</span>
        <p className="text-sm text-muted">
          Share this link so friends can create an account. It never expires and anyone with it can join.
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
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted">
        <UsersThree className="h-4 w-4" weight="bold" />
        <span>
          Invited <span className="font-semibold text-foreground">{invitedCount}</span>{" "}
          {invitedCount === 1 ? "friend" : "friends"}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted">Link leaked or shared too widely?</span>
        <Button
          variant="danger"
          icon={<ArrowsClockwise className="h-4 w-4" />}
          onClick={() => setConfirmOpen(true)}
        >
          Regenerate
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Regenerate invite link?"
        description="Your current link will stop working immediately. Anyone you've already sent it to won't be able to sign up with it."
        confirmLabel="Regenerate"
        tone="danger"
        loading={regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
