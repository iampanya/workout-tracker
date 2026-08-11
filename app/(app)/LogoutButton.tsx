"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LogoutButton({ labeled = false }: { labeled?: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
        description="You'll need to sign in with your username again to get back in."
        confirmLabel="Log out"
        tone="danger"
        loading={pending}
        onConfirm={handleLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
