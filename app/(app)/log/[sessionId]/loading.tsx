import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton rows={3} rowClassName="h-40" />;
}
