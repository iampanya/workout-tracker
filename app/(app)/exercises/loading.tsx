import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton rows={8} rowClassName="h-16" />;
}
