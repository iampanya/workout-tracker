import { Prisma, type PrismaClient, type body_scans } from "@prisma/client";
import { z } from "zod";
import { toScanDateString } from "./metrics";
import {
  SCAN_METRIC_KEYS,
  parseBodyImport,
  type BodyImportErrorCode,
  type BodyReport,
  type BodyScanInput,
  type BodySegments,
  type ScanMetricKey,
} from "./schema";

export type BodyScan = {
  id: string;
  // ISO instant.
  measured_at: string;
  // YYYY-MM-DD in TIME_ZONE.
  scan_date: string;
  source: string;
  segments: BodySegments | null;
  report: BodyReport | null;
} & Record<ScanMetricKey, number | null>;

export type BodySummary = { latest: BodyScan; previous: BodyScan | null };

// A rejected import file. `code` is what the UI translates (errors.body.*); `message` stays
// English for logs.
export class BodyImportError extends Error {
  constructor(
    public readonly code: BodyImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BodyImportError";
  }
}

function toBodyScan(row: body_scans): BodyScan {
  const metrics = {} as Record<ScanMetricKey, number | null>;
  for (const key of SCAN_METRIC_KEYS) {
    const value = row[key];
    metrics[key] = value === null ? null : Number(value);
  }
  return {
    id: row.id,
    measured_at: row.measured_at.toISOString(),
    scan_date: toScanDateString(row.measured_at),
    source: row.source,
    // Validated by bodyScanInputSchema on the way in.
    segments: (row.segments as BodySegments | null) ?? null,
    report: (row.report as BodyReport | null) ?? null,
    ...metrics,
  };
}

// Every metric column, null when the scan omits it — so a re-import fully replaces the row.
function metricData(scan: BodyScanInput) {
  const data = {} as Record<ScanMetricKey, number | null>;
  for (const key of SCAN_METRIC_KEYS) data[key] = scan[key] ?? null;
  return { ...data, weight_kg: scan.weight_kg };
}

// Upserts every scan in the file by (user_id, measured_at) in one transaction: re-importing a
// scan replaces it (that's how a misread value gets fixed). `replaced` counts rows that existed.
export async function importBodyScansForUser(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<{ imported: number; replaced: number }> {
  const parsed = parseBodyImport(raw);
  if (!parsed.ok) throw new BodyImportError(parsed.code, `Invalid body-scan import (${parsed.code})`);
  const { source, scans } = parsed.data;

  return db.$transaction(
    async (tx) => {
      const replaced = await tx.body_scans.count({
        where: { user_id: userId, measured_at: { in: scans.map((s) => new Date(s.measured_at)) } },
      });
      for (const scan of scans) {
        const measuredAt = new Date(scan.measured_at);
        const data = {
          source,
          ...metricData(scan),
          // Prisma needs DbNull (not null) to write SQL NULL into a Json? column.
          segments: (scan.segments ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          report: (scan.report ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
        };
        await tx.body_scans.upsert({
          where: { user_id_measured_at: { user_id: userId, measured_at: measuredAt } },
          create: { user_id: userId, measured_at: measuredAt, ...data },
          update: data,
        });
      }
      return { imported: scans.length, replaced };
    },
    { timeout: 30_000 }
  );
}

// Oldest first (chart order); the history list reverses it.
export async function listBodyScans(db: PrismaClient, userId: string): Promise<BodyScan[]> {
  const rows = await db.body_scans.findMany({ where: { user_id: userId }, orderBy: { measured_at: "asc" } });
  return rows.map(toBodyScan);
}

export async function getBodyScan(db: PrismaClient, userId: string, scanId: string): Promise<BodyScan | null> {
  // A malformed id in the URL is a 404, not a Prisma error.
  if (!z.uuid().safeParse(scanId).success) return null;
  const row = await db.body_scans.findFirst({ where: { id: scanId, user_id: userId } });
  return row ? toBodyScan(row) : null;
}

export async function deleteBodyScanForUser(db: PrismaClient, userId: string, scanId: string): Promise<void> {
  // Scoped by user_id; count === 0 means it doesn't exist or isn't theirs.
  const result = await db.body_scans.deleteMany({ where: { id: scanId, user_id: userId } });
  if (result.count === 0) throw new Error("Body scan not found or not owned by user");
}

export async function getLatestBodySummary(db: PrismaClient, userId: string): Promise<BodySummary | null> {
  const rows = await db.body_scans.findMany({
    where: { user_id: userId },
    orderBy: { measured_at: "desc" },
    take: 2,
  });
  if (rows.length === 0) return null;
  return { latest: toBodyScan(rows[0]), previous: rows[1] ? toBodyScan(rows[1]) : null };
}
