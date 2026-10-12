import { getTranslations } from "next-intl/server";
import { House, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

// Rendered for every notFound() call (bad exercise/history/log/routine ids) and for
// unmatched URLs.
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
      <EmptyState
        icon={<MagnifyingGlass className="h-6 w-6" />}
        title={t("title")}
        description={t("description")}
        action={
          <ButtonLink href="/dashboard" icon={<House className="h-4 w-4" />}>
            {t("backToDashboard")}
          </ButtonLink>
        }
      />
    </main>
  );
}
