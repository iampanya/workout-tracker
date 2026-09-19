"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function LogoutButton({ labeled = false }: { labeled?: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <>
      {labeled ? (
        <Button
          variant="danger"
          icon={<SignOut className="h-5 w-5" />}
          onClick={() => setConfirmOpen(true)}
        >
          Log out
        </Button>
      ) : (
        <IconButton
          icon={<SignOut className="h-5 w-5" />}
          aria-label="Log out"
          onClick={() => setConfirmOpen(true)}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Log out?"
        description="You'll need to sign in with Google again to get back in."
        confirmLabel="Log out"
        tone="danger"
        loading={pending}
        onConfirm={handleLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
