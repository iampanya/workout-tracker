import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { ThemeModeControl } from "@/components/theme/ThemeModeControl";
import { AccentControl } from "@/components/theme/AccentControl";
import { LanguageControl } from "@/components/theme/LanguageControl";
import { LogoutButton } from "../LogoutButton";
import { BackupCard } from "./BackupCard";

export default async function SettingsPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("settings");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("appearance")}
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t("mode")}</span>
          <ThemeModeControl />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t("color")}</span>
          <AccentControl />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t("language")}</span>
          <LanguageControl />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("backupRestore")}
        </span>
        <BackupCard />
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("account")}
        </span>
        <LogoutButton labeled />
      </Card>
    </div>
  );
}
