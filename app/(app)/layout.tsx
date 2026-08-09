import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen pb-16">
      <main className="p-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t bg-white p-2">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/routines">Routines</Link>
        <Link href="/exercises">Exercises</Link>
        <Link href="/history">History</Link>
      </nav>
    </div>
  );
}
