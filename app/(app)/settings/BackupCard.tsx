"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { exportBackup, importBackup } from "@/lib/actions/backup";
import type { ImportMode, ImportSummary } from "@/lib/backup/service";

function summaryLine(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.exercises) parts.push(`${s.exercises} exercises`);
  if (s.routines) parts.push(`${s.routines} routines`);
  if (s.sessions) parts.push(`${s.sessions} workouts`);
  if (s.sets) parts.push(`${s.sets} sets`);
  return parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import — your data already matches this file.";
}

export function BackupCard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMode = useRef<ImportMode>("merge");

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Parsed file waiting on the Replace confirmation dialog.
  const [pendingReplace, setPendingReplace] = useState<unknown | null>(null);

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
      setError(err instanceof Error ? err.message : "Could not export your data");
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
        setError(result.error ?? "Could not import backup");
        return;
      }
      setMessage(summaryLine(result.summary));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import backup");
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
      setError("That file isn't valid JSON.");
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
          Export backup
        </Button>
        <Button
          variant="secondary"
          icon={<UploadSimple className="h-5 w-5" />}
          onClick={() => pickFile("merge")}
          disabled={busy}
        >
          Import &amp; merge
        </Button>
        <Button
          variant="danger"
          icon={<UploadSimple className="h-5 w-5" />}
          onClick={() => pickFile("replace")}
          disabled={busy}
        >
          Import &amp; replace all
        </Button>
      </div>

      <p className="text-xs text-muted">
        Export downloads all your exercises, routines, and workout history as a JSON file.
        Merge adds a backup&apos;s data to what you have now; replace wipes your current data first.
      </p>

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={pendingReplace !== null}
        title="Replace all data?"
        description="This permanently deletes all your current exercises, routines, and workout history, then restores everything from the file. This can't be undone."
        confirmLabel="Replace everything"
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
