import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton tiles={3} rows={2} rowClassName="h-64" />;
}
