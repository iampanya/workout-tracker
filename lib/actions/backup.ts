"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { exportUserData, importUserData, type ImportMode, type ImportSummary } from "@/lib/backup/service";
import type { BackupFile } from "@/lib/validation";

async function currentUserId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function exportBackup(): Promise<BackupFile> {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return exportUserData(supabase, userId);
}

export type ImportResult = { error: string | null; summary: ImportSummary | null };

export async function importBackup(rawFile: unknown, mode: ImportMode): Promise<ImportResult> {
  const supabase = await createServerSupabaseClient();
  await currentUserId(supabase);

  let summary: ImportSummary;
  try {
    summary = await importUserData(supabase, rawFile, mode);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import backup", summary: null };
  }

  // A restore/merge can touch every list in the app.
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/routines");
  revalidatePath("/exercises");
  return { error: null, summary };
}
