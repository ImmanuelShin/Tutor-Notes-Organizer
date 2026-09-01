import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PageHeader } from "../components/ui";
import { PasteTable } from "../components/PasteTable";

export function ImportWizard() {
  const [dataDir, setDataDir] = useState<string>("");

  useEffect(() => {
    void invoke<string>("get_app_data_dir").then(setDataDir);
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Paste table"
        subtitle="Copy a range from Google Sheets and paste it here. Map columns to match whatever layout you use. PDFs stay on Resources."
      />

      <section className="card mb-4 p-4">
        <h2 className="mb-2 text-lg">Backup</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          All notes, PDFs, and pasted images live in this folder. Copy it to back up or move machines:
        </p>
        <code className="mt-2 block overflow-auto rounded-lg bg-[var(--bg)] px-3 py-2 text-xs">
          {dataDir || "Loading…"}
        </code>
      </section>

      <section className="card p-4">
        <PasteTable />
      </section>
    </div>
  );
}
