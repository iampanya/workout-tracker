"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Archive } from "@phosphor-icons/react/ssr";
import { archiveExercise } from "@/lib/actions/exercises";
import { IconButton } from "@/components/ui/IconButton";

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  const t = useTranslations("exercises");
  const te = useTranslations("errors");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setPending(true);
    setError(null);
    try {
      await archiveExercise(exerciseId);
    } catch (err) {
      console.error(err);
      setError(te("archiveExercise"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Archive className="h-4 w-4" />}
        aria-label={t("archiveLabel")}
        loading={pending}
        onClick={handleArchive}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
