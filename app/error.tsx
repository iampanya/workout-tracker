"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowClockwise, House, WarningCircle } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

// Error boundary for every route under the root layout (errors in the root layout
// itself would need app/global-error.tsx). `retry` re-fetches and re-renders the
// segment, so it also recovers from a transient server-component failure; `reset`
// would only re-render without re-fetching.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
      <EmptyState
        icon={<WarningCircle className="h-6 w-6" />}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()} icon={<ArrowClockwise className="h-4 w-4" />}>
              {t("retry")}
            </Button>
            <ButtonLink href="/dashboard" variant="secondary" icon={<House className="h-4 w-4" />}>
              {t("backToDashboard")}
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}
