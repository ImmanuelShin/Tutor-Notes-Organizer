import { useCallback, useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/format";

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/35"
      onMouseDown={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-4 py-6">
        <div
          className={cn(
            "card w-full overflow-y-auto p-5",
            wide ? "max-w-4xl" : "max-w-lg",
          )}
          style={{ maxHeight: "calc(100vh - 3rem)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 flex items-start justify-between gap-4 bg-[var(--bg-raised)] px-5 pt-5 pb-3">
            <h2 className="text-xl">{title}</h2>
            <button className="btn btn-quiet btn-small" onClick={onClose} type="button">
              Close
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-start gap-3 p-8">
      <h2 className="text-2xl">{title}</h2>
      <p className="max-w-xl text-[var(--ink-muted)]">{body}</p>
      {action}
    </div>
  );
}

export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const next = e.currentTarget.value.trim().replace(/,$/, "");
      if (next && !value.includes(next)) onChange([...value, next]);
      e.currentTarget.value = "";
    } else if (e.key === "Backspace" && !e.currentTarget.value && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="field flex min-h-10 flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <span key={tag} className="chip">
          {tag}
          <button
            type="button"
            className="ml-0.5 opacity-70 hover:opacity-100"
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-28 flex-1 border-0 bg-transparent outline-none"
        placeholder={value.length ? "" : "Add tag, then Enter"}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--ink-muted)]">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  danger,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  const onClick = useCallback(() => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    setArmed(false);
    onConfirm();
  }, [armed, onConfirm]);

  return (
    <button
      type="button"
      className={cn("btn btn-small", danger && "btn-danger")}
      onClick={onClick}
    >
      {armed ? confirm : label}
    </button>
  );
}

export function SubjectCombobox({
  value,
  onChange,
  subjects,
  onBlur,
  placeholder = "e.g. Algebra 1",
}: {
  value: string;
  onChange: (value: string) => void;
  subjects: string[];
  onBlur?: () => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <>
      <input
        className="field mt-1"
        list={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <datalist id={id}>
        {subjects.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
