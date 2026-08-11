import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInProgressSessions } from "@/lib/dashboard/service";
import { getProfile } from "@/lib/profiles/service";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, inProgress] = await Promise.all([
    getProfile(supabase, user.id),
    listInProgressSessions(supabase),
  ]);

  return (
    <div className="min-h-screen pb-24">
      <TopBar username={profile.username} />
      <main className="p-4">{children}</main>
      <BottomNav resumeSessionId={inProgress[0]?.id ?? null} />
    </div>
  );
}
