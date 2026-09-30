import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { ThemeModeControl } from "@/components/theme/ThemeModeControl";
import { AccentControl } from "@/components/theme/AccentControl";
import { LogoutButton } from "../LogoutButton";
import { BackupCard } from "./BackupCard";

export default async function SettingsPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Appearance
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Mode</span>
          <ThemeModeControl />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Color</span>
          <AccentControl />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Backup &amp; Restore
        </span>
        <BackupCard />
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
