"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LogoutButton({ labeled = false }: { labeled?: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (labeled) {
    return (
      <Button
        variant="danger"
        icon={<SignOut className="h-5 w-5" />}
        onClick={handleLogout}
      >
        Log out
      </Button>
    );
  }

  return <IconButton icon={<SignOut className="h-5 w-5" />} aria-label="Log out" onClick={handleLogout} />;
}
