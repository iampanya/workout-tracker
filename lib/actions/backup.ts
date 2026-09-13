"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { exportUserData, importUserData, type ImportMode, type ImportSummary } from "@/lib/backup/service";
import type { BackupFile } from "@/lib/validation";

export async function exportBackup(): Promise<BackupFile> {
  const userId = await requireUserId();
  return exportUserData(prisma, userId);
}

export type ImportResult = { error: string | null; summary: ImportSummary | null };

export async function importBackup(rawFile: unknown, mode: ImportMode): Promise<ImportResult> {
  const userId = await requireUserId();

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
