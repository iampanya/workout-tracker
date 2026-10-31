import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getBodyScan } from "@/lib/body/service";
import { METRIC_UNITS } from "@/lib/body/metrics";
import { SCAN_METRIC_KEYS, SEGMENT_KEYS } from "@/lib/body/schema";
import { formatSessionDate } from "@/lib/sessions/summary";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DeleteScanButton } from "./DeleteScanButton";

const WEIGHT_CONTROL_KEYS = ["normal_weight_kg", "weight_kg", "fat_kg", "muscle_kg"] as const;

export default async function BodyScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const user = await getAuthUser();
  const scan = await getBodyScan(prisma, user!.id, scanId);
  if (!scan) notFound();

  const [locale, t, format] = await Promise.all([getLocale(), getTranslations("body"), getFormatter()]);
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const signed = (value: number) => format.number(value, { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const dateLabel = formatSessionDate(scan.scan_date, locale);
  const ranges = scan.report?.ranges ?? {};
  const evaluations = scan.report?.evaluations ?? {};
  const assessments = Object.entries(scan.report?.assessments ?? {});
  const weightControl = scan.report?.weight_control;
  const segments = SEGMENT_KEYS.flatMap((key) => {
    const segment = scan.segments?.[key];
    return segment ? [{ key, segment }] : [];
  });

  function rangeLabel(range: [number | null, number | null] | undefined): string | null {
    if (!range) return null;
    const [min, max] = range;
    if (min !== null && max !== null) return t("range", { min: n(min), max: n(max) });
    if (max !== null) return t("rangeMax", { max: n(max) });
    if (min !== null) return t("rangeMin", { min: n(min) });
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("detailTitle")}</h1>
          <p className="text-sm text-muted">{dateLabel}</p>
        </div>
        <DeleteScanButton scanId={scan.id} dateLabel={dateLabel} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">{t("values")}</h2>
        <Card padding={false}>
          <dl className="divide-y divide-border">
            {SCAN_METRIC_KEYS.map((key) => {
              const value = scan[key];
              if (value === null) return null;
              const range = rangeLabel(ranges[key]);
              const verdict = evaluations[key];
              return (
                <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="min-w-0">
                    <span className="block text-sm">{t(`metrics.${key}`)}</span>
                    {range && <span className="block text-xs text-muted">{range}</span>}
                  </dt>
                  <dd className="flex shrink-0 items-center gap-2">
                    {verdict && <Badge>{verdict}</Badge>}
                    <span className="font-mono tabular-nums">
                      {n(value)}
                      {METRIC_UNITS[key] && ` ${METRIC_UNITS[key]}`}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </section>

      {segments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("segments")}</h2>
          <Card padding={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    <span className="sr-only">{t("segments")}</span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">{t("segmentLean")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("segmentFat")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segments.map(({ key, segment }) => (
                  <tr key={key}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">{t(`segmentNames.${key}`)}</th>
                    <td className="px-2 py-2 text-right">
                      <span className="font-mono tabular-nums">
                        {segment.lean_kg != null ? `${n(segment.lean_kg)} kg` : "–"}
                      </span>
                      {segment.lean_eval && <span className="block text-xs text-muted">{segment.lean_eval}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-mono tabular-nums">
                        {segment.fat_kg != null ? `${n(segment.fat_kg)} kg` : "–"}
                      </span>
                      {segment.fat_eval && <span className="block text-xs text-muted">{segment.fat_eval}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {assessments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("assessments")}</h2>
          <Card padding={false}>
            <dl className="divide-y divide-border">
              {assessments.map(([label, verdict]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <dt>{label}</dt>
                  <dd><Badge>{verdict}</Badge></dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      )}

      {weightControl && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("weightControl")}</h2>
          <Card padding={false}>
            <dl className="divide-y divide-border">
              {WEIGHT_CONTROL_KEYS.map((key) => {
                const value = weightControl[key];
                if (value == null) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <dt>{t(`weightControlKeys.${key}`)}</dt>
                    <dd className="font-mono tabular-nums">
                      {key === "normal_weight_kg" ? n(value) : signed(value)} kg
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        </section>
      )}

      {scan.report?.advice && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("advice")}</h2>
          <Card>
            <p className="text-sm">{scan.report.advice}</p>
          </Card>
        </section>
      )}
    </div>
  );
}
