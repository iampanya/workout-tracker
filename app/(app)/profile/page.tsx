import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getProfile } from "@/lib/profiles/service";
import { getReferralInfo } from "@/lib/referrals/service";
import { Card } from "@/components/ui/Card";
import { ReferralCard } from "./ReferralCard";

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(supabase, user.id);
  const referral = await getReferralInfo(supabase, user.id);

  // Build the shareable link's origin server-side (no window on the server, and this avoids a
  // client effect + hydration flash). Falls back to a relative path if headers are unavailable.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

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

      <ReferralCard code={referral.code} invitedCount={referral.invitedCount} origin={origin} />
    </div>
  );
}
