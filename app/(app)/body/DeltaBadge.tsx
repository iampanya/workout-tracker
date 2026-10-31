import { useFormatter } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { deltaTone } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";

// "+0.4" / "-1.2" vs the previous scan, green when it moved the good way (see goodDirection).
export function DeltaBadge({ metric, delta }: { metric: ScanMetricKey; delta: number | null }) {
  const format = useFormatter();
  if (delta === null || delta === 0) return null;
  return (
    <Badge tone={deltaTone(metric, delta)}>
      {format.number(delta, { maximumFractionDigits: 2, signDisplay: "always" })}
    </Badge>
  );
}
