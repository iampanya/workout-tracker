import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles/service";
import { Card } from "@/components/ui/Card";

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(supabase, user.id);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Profile</h1>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Username</span>
          <span className="text-lg font-semibold text-foreground">{profile.username}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Email</span>
          <span className="text-sm text-foreground">{user.email ?? "—"}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Member since
          </span>
          <span className="text-sm text-foreground">{formatMemberSince(profile.createdAt)}</span>
        </div>
      </Card>
    </div>
  );
}
