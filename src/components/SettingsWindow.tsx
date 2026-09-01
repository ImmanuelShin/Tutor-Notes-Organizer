import { useEffect, useState } from "react";
import { cn } from "../lib/format";

const SECTIONS = [{ id: "general", label: "General" }] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsWindow({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("general");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="settings-window-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="settings-window-panel card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-window-title"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3">
          <h2 id="settings-window-title" className="text-xl">
            Settings
          </h2>
          <button className="btn btn-quiet btn-small" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-[var(--line)] bg-[var(--bg-sidebar)] p-2">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-xl px-3 py-2 text-left text-sm",
                  section === item.id
                    ? "bg-[var(--bg-raised)] shadow-sm"
                    : "hover:bg-[var(--bg-hover)]",
                )}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-auto p-6">
            {section === "general" ? (
              <div>
                <h3 className="text-lg">General</h3>
                <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)]">
                  More options will live here. Use the sidebar on the left as we add sections.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
