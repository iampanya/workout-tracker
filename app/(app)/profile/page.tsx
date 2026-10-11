import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profiles/service";
import { getReferralInfo } from "@/lib/referrals/service";
import { Card } from "@/components/ui/Card";
import { ReferralCard } from "./ReferralCard";

export default async function ProfilePage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const [t, format] = await Promise.all([getTranslations("profile"), getFormatter()]);
  const profile = await getProfile(prisma, user.id);
  const referral = await getReferralInfo(prisma, user.id);

  // Build the shareable link's origin server-side (no window on the server, and this avoids a
  // client effect + hydration flash). Falls back to a relative path if headers are unavailable.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("username")}</span>
          <span className="text-lg font-semibold text-foreground">{profile.username}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("email")}</span>
          <span className="text-sm text-foreground">{user.email ?? "—"}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("memberSince")}
          </span>
          <span className="text-sm text-foreground">{format.dateTime(new Date(profile.createdAt), { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </Card>

      <ReferralCard code={referral.code} invitedCount={referral.invitedCount} origin={origin} />
    </div>
  );
}
