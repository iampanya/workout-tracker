"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { exportUserData, importUserData, type ImportMode, type ImportSummary } from "@/lib/backup/service";
import type { BackupFile } from "@/lib/validation";

// Identity still from the Supabase (GoTrue) session; data via prisma.
async function currentUserId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function exportBackup(): Promise<BackupFile> {
  const userId = await currentUserId();
  return exportUserData(prisma, userId);
}

export type ImportResult = { error: string | null; summary: ImportSummary | null };

export async function importBackup(rawFile: unknown, mode: ImportMode): Promise<ImportResult> {
  const userId = await currentUserId();

  let summary: ImportSummary;
  try {
    summary = await importUserData(prisma, userId, rawFile, mode);
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
