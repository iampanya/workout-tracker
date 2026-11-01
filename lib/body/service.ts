import { Prisma, type PrismaClient, type body_goals, type body_scans } from "@prisma/client";
import { z } from "zod";
import { deriveManualMetrics, manualScanInputSchema, type ManualMetrics } from "./manual";
import { toScanDateString } from "./metrics";
import {
  GOAL_METRICS,
  SCAN_METRIC_KEYS,
  bodyGoalsInputSchema,
  parseBodyImport,
  type BodyImportErrorCode,
  type BodyReport,
  type BodyScanInput,
  type BodySegments,
  type GoalMetric,
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

export type BodyManualErrorCode = "invalid" | "duplicateTime" | "futureTime" | "notFound";

// A rejected manual entry; `code` is translated by the UI (errors.body.*).
export class BodyManualError extends Error {
  constructor(
    public readonly code: BodyManualErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BodyManualError";
  }
}

// A device clock a little ahead of the server's shouldn't block "now".
const FUTURE_SLACK_MS = 5 * 60_000;

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

// Creates a manual scan, or replaces every value of one (with `scanId`). Only source "manual"
// rows can be edited — an imported scan is fixed by re-importing, so its segments/report stay.
// A time another of the user's scans already has is rejected rather than overwriting it.
export async function saveManualBodyScanForUser(
  db: PrismaClient,
  userId: string,
  raw: unknown,
  scanId?: string
): Promise<string> {
  const parsed = manualScanInputSchema.safeParse(raw);
  if (!parsed.success) throw new BodyManualError("invalid", "Invalid manual body scan");
  const measuredAt = new Date(parsed.data.measured_at);
  if (measuredAt.getTime() > Date.now() + FUTURE_SLACK_MS) {
    throw new BodyManualError("futureTime", "Manual body scan is in the future");
  }
  if (scanId !== undefined && !z.uuid().safeParse(scanId).success) {
    throw new BodyManualError("notFound", "Body scan not found or not editable");
  }

  try {
    return await saveManualInTransaction(db, userId, measuredAt, deriveManualMetrics(parsed.data), scanId);
  } catch (err) {
    // A concurrent save that slipped past the clash check hits unique(user_id, measured_at).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BodyManualError("duplicateTime", "Another scan has this measured_at");
    }
    throw err;
  }
}

function saveManualInTransaction(
  db: PrismaClient,
  userId: string,
  measuredAt: Date,
  metrics: ManualMetrics,
  scanId: string | undefined
): Promise<string> {
  return db.$transaction(async (tx) => {
    const clash = await tx.body_scans.findFirst({
      where: { user_id: userId, measured_at: measuredAt, ...(scanId ? { id: { not: scanId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new BodyManualError("duplicateTime", "Another scan has this measured_at");

    const data = { measured_at: measuredAt, ...metrics };
    if (!scanId) {
      const row = await tx.body_scans.create({
        data: { user_id: userId, source: "manual", segments: Prisma.DbNull, report: Prisma.DbNull, ...data },
        select: { id: true },
      });
      return row.id;
    }
    // Scoped by user_id and source; count === 0 means missing, imported, or not theirs.
    const result = await tx.body_scans.updateMany({ where: { id: scanId, user_id: userId, source: "manual" }, data });
    if (result.count === 0) throw new BodyManualError("notFound", "Body scan not found or not editable");
    return scanId;
  });
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

export type BodyGoal = { metric: GoalMetric; target: number; start_value: number };

// Goals come back in GOAL_METRICS order (weight, fat, muscle). Not created_at: goals saved in one
// transaction share its now(), so that order would be arbitrary.
function toBodyGoals(rows: body_goals[]): BodyGoal[] {
  return rows
    .map((row) => ({ metric: row.metric as GoalMetric, target: Number(row.target), start_value: Number(row.start_value) }))
    .sort((a, b) => GOAL_METRICS.indexOf(a.metric) - GOAL_METRICS.indexOf(b.metric));
}

export async function listBodyGoals(db: PrismaClient, userId: string): Promise<BodyGoal[]> {
  return toBodyGoals(await db.body_goals.findMany({ where: { user_id: userId } }));
}

// Replaces the user's whole goal set. A goal whose metric already exists keeps its start_value
// (only the target changes), so nudging a target doesn't reset progress; a new goal starts from
// the latest scan's value and fails if there's no scan with that value yet.
export async function replaceBodyGoalsForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<BodyGoal[]> {
  const goals = bodyGoalsInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.body_goals.deleteMany({
      where: { user_id: userId, metric: { notIn: goals.map((g) => g.metric) } },
    });
    const existing = new Set(
      (await tx.body_goals.findMany({ where: { user_id: userId }, select: { metric: true } })).map((g) => g.metric)
    );
    const latest = await tx.body_scans.findFirst({ where: { user_id: userId }, orderBy: { measured_at: "desc" } });

    for (const goal of goals) {
      if (existing.has(goal.metric)) {
        await tx.body_goals.update({
          where: { user_id_metric: { user_id: userId, metric: goal.metric } },
          data: { target: goal.target },
        });
        continue;
      }
      const start = latest?.[goal.metric] ?? null;
      if (start === null) throw new Error(`No scan with ${goal.metric} to start a goal from`);
      await tx.body_goals.create({
        data: { user_id: userId, metric: goal.metric, target: goal.target, start_value: start },
      });
    }

    return toBodyGoals(await tx.body_goals.findMany({ where: { user_id: userId } }));
  });
}

// Working sets per muscle group in completed sessions dated fromDate..toDate (inclusive,
// YYYY-MM-DD) — the "where your sets go" side of the balance card.
export async function countWorkingSetsByMuscleGroup(
  db: PrismaClient,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<{ muscle_group: string | null; sets: number }[]> {
  return db.$queryRaw<{ muscle_group: string | null; sets: number }[]>(Prisma.sql`
    select e.muscle_group, count(*)::int as sets
    from sets st
    join session_exercises se on se.id = st.session_exercise_id
    join sessions s on s.id = se.session_id
    join exercises e on e.id = st.exercise_id
    where st.user_id::text = ${userId} and s.user_id::text = ${userId}
      and not st.is_warmup and s.completed_at is not null
      and s.session_date >= ${fromDate}::date and s.session_date <= ${toDate}::date
    group by e.muscle_group`);
}
