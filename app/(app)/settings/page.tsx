import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles/service";
import { Card } from "@/components/ui/Card";
import { ThemeModeControl } from "@/components/theme/ThemeModeControl";
import { LogoutButton } from "../LogoutButton";

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function SettingsPage() {
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
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      <Card className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Profile
        </span>
        <span className="text-lg font-semibold text-foreground">{profile.username}</span>
        <span className="text-sm text-muted">
          Member since {formatMemberSince(profile.createdAt)}
        </span>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Appearance
        </span>
        <ThemeModeControl />
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Account
        </span>
        <LogoutButton labeled />
      </Card>
    </div>
  );
}
