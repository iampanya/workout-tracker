import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { Card } from "@/components/ui/Card";
import { ThemeModeControl } from "@/components/theme/ThemeModeControl";
import { LogoutButton } from "../LogoutButton";

export default async function SettingsPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

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
