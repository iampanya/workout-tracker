import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/LandingPage";

// Public landing. Logged-in users can still view it (e.g. via the in-app logo);
// its CTAs adapt to point back into the app instead of to login/signup.
export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage authed={!!user} />;
}
