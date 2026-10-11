"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { exportBackup, importBackup } from "@/lib/actions/backup";
import type { ImportMode, ImportSummary } from "@/lib/backup/service";

export function BackupCard() {
  const t = useTranslations("settings.backup");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMode = useRef<ImportMode>("merge");

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Parsed file waiting on the Replace confirmation dialog.
  const [pendingReplace, setPendingReplace] = useState<unknown | null>(null);

  function summaryLine(s: ImportSummary): string {
    const parts: string[] = [];
    if (s.exercises) parts.push(tc("exercises", { count: s.exercises }));
    if (s.routines) parts.push(tc("routines", { count: s.routines }));
    if (s.sessions) parts.push(tc("workouts", { count: s.sessions }));
    if (s.sets) parts.push(tc("sets", { count: s.sets }));
    return parts.length ? t("imported", { parts: format.list(parts) }) : t("nothingNew");
  }

  async function handleExport() {
    setError(null);
    setMessage(null);
    setExporting(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      const a = document.createElement("a");
      a.href = url;
      a.download = `workout-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(te("exportBackup"));
    } finally {
      setExporting(false);
    }
  }

  function pickFile(mode: ImportMode) {
    setError(null);
    setMessage(null);
    pendingMode.current = mode;
    fileInputRef.current?.click();
  }

  async function runImport(rawFile: unknown, mode: ImportMode) {
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await importBackup(rawFile, mode);
      if (result.error || !result.summary) {
        setError(te(`backup.${result.error ?? "importFailed"}`));
        return;
      }
      setMessage(summaryLine(result.summary));
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("backup.importFailed"));
    } finally {
      setImporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!file) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError(te("invalidJson"));
      return;
    }

    if (pendingMode.current === "replace") {
      setPendingReplace(parsed);
    } else {
      await runImport(parsed, "merge");
    }
  }

  const busy = exporting || importing;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          icon={<DownloadSimple className="h-5 w-5" />}
          onClick={handleExport}
          loading={exporting}
          disabled={busy}
        >
          {t("export")}
        </Button>
        <Button
          variant="secondary"
          icon={<UploadSimple className="h-5 w-5" />}
          onClick={() => pickFile("merge")}
          disabled={busy}
        >
          {t("importMerge")}
        </Button>
        <Button
          variant="danger"
          icon={<UploadSimple className="h-5 w-5" />}
          onClick={() => pickFile("replace")}
          disabled={busy}
        >
          {t("importReplace")}
        </Button>
      </div>

      <p className="text-xs text-muted">
        {t("help")}
      </p>

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={pendingReplace !== null}
        title={t("replaceTitle")}
        description={t("replaceDescription")}
        confirmLabel={t("replaceConfirm")}
        tone="danger"
        loading={importing}
        onConfirm={() => {
          const file = pendingReplace;
          setPendingReplace(null);
          if (file !== null) void runImport(file, "replace");
        }}
        onCancel={() => setPendingReplace(null)}
      />
    </>
  );
}
