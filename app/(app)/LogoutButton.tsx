"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function LogoutButton({ labeled = false }: { labeled?: boolean }) {
  const t = useTranslations("account");
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
          {t("logOut")}
        </Button>
      ) : (
        <IconButton
          icon={<SignOut className="h-5 w-5" />}
          aria-label={t("logOut")}
          onClick={() => setConfirmOpen(true)}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={t("logOutTitle")}
        description={t("logOutDescription")}
        confirmLabel={t("logOut")}
        tone="danger"
        loading={pending}
        onConfirm={handleLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
