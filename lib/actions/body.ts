"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  BodyImportError,
  deleteBodyScanForUser,
  importBodyScansForUser,
  replaceBodyGoalsForUser,
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
