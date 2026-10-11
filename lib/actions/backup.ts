"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  BackupImportError,
  exportUserData,
  importUserData,
  type BackupImportErrorCode,
  type ImportMode,
  type ImportSummary,
} from "@/lib/backup/service";
import type { BackupFile } from "@/lib/validation";

export async function exportBackup(): Promise<BackupFile> {
  const userId = await requireUserId();
  return exportUserData(prisma, userId);
}

export type ImportErrorCode = BackupImportErrorCode | "importFailed";
export type ImportResult = { error: ImportErrorCode | null; summary: ImportSummary | null };

export async function importBackup(rawFile: unknown, mode: ImportMode): Promise<ImportResult> {
  const userId = await requireUserId();

  let summary: ImportSummary;
  try {
    summary = await importUserData(prisma, userId, rawFile, mode);
  } catch (err) {
    if (err instanceof BackupImportError) return { error: err.code, summary: null };
    console.error(err);
    return { error: "importFailed", summary: null };
  }

  // A restore/merge can touch every list in the app.
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/routines");
  revalidatePath("/exercises");
  return { error: null, summary };
}
