"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/ssr";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { IconButton } from "@/components/ui/IconButton";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return <IconButton icon={<SignOut className="h-5 w-5" />} aria-label="Log out" onClick={handleLogout} />;
}
