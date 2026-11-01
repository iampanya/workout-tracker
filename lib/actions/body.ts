"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  BodyImportError,
  BodyManualError,
  deleteBodyScanForUser,
  importBodyScansForUser,
  replaceBodyGoalsForUser,
  saveManualBodyScanForUser,
  type BodyManualErrorCode,
} from "@/lib/body/service";
import type { BodyImportErrorCode } from "@/lib/body/schema";

export type BodyImportResult = {
  error: BodyImportErrorCode | "importFailed" | null;
  imported: number;
  replaced: number;
};

function revalidateBody() {
  revalidatePath("/body");
  revalidatePath("/dashboard");
}

export async function importBodyScans(rawFile: unknown): Promise<BodyImportResult> {
  const userId = await requireUserId();
  try {
    const { imported, replaced } = await importBodyScansForUser(prisma, userId, rawFile);
    revalidateBody();
    return { error: null, imported, replaced };
  } catch (err) {
    if (err instanceof BodyImportError) return { error: err.code, imported: 0, replaced: 0 };
    console.error(err);
    return { error: "importFailed", imported: 0, replaced: 0 };
  }
}

export type ManualBodyScanResult =
  | { error: null; id: string }
  | { error: BodyManualErrorCode | "saveFailed"; id: null };

// Without `scanId` creates a manual scan; with it, edits that (manual) scan.
export async function saveManualBodyScan(input: unknown, scanId?: string): Promise<ManualBodyScanResult> {
  const userId = await requireUserId();
  try {
    const id = await saveManualBodyScanForUser(prisma, userId, input, scanId);
    revalidateBody();
    revalidatePath(`/body/${id}`);
    return { error: null, id };
  } catch (err) {
    if (err instanceof BodyManualError) return { error: err.code, id: null };
    console.error(err);
    return { error: "saveFailed", id: null };
  }
}

export async function deleteBodyScan(scanId: string) {
  const userId = await requireUserId();
  await deleteBodyScanForUser(prisma, userId, scanId);
  revalidateBody();
}

export async function saveBodyGoals(goals: unknown) {
  const userId = await requireUserId();
  await replaceBodyGoalsForUser(prisma, userId, goals);
  revalidateBody();
}
