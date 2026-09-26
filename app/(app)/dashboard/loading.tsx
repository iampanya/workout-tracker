import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton tiles={3} rows={3} rowClassName="h-24" />;
}
