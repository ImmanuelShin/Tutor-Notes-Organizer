import type {
  ChecklistItem,
  ChecklistTemplateBody,
  Template,
  TemplateKind,
  Workspace,
} from "../types";
import { uid } from "./worksheet";
import { applyChecklistItems } from "./workspace";

export const TEMPLATE_KINDS: TemplateKind[] = ["checklist"];

export function parseTemplateKind(raw: unknown): TemplateKind {
  return raw === "checklist" ? "checklist" : "checklist";
}

export function templateKindLabel(kind: TemplateKind): string {
  if (kind === "checklist") return "Checklist";
  return kind;
}

export function emptyTemplateBody(kind: TemplateKind): string {
  if (kind === "checklist") return JSON.stringify({ items: [] } satisfies ChecklistTemplateBody);
  return "{}";
}

export function parseChecklistBody(raw: string | null | undefined): ChecklistTemplateBody {
  if (!raw?.trim()) return { items: [] };
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => {
            if (typeof item === "string") return { text: item };
            if (item && typeof item === "object" && "text" in item) {
              return { text: String((item as { text?: unknown }).text ?? "") };
            }
            return null;
          })
          .filter((item): item is { text: string } => Boolean(item && item.text.trim()))
      : [];
    return { items };
  } catch {
    return { items: [] };
  }
}

export function serializeChecklistBody(body: ChecklistTemplateBody): string {
  return JSON.stringify({
    items: body.items.map((item) => ({ text: item.text.trim() })).filter((item) => item.text),
  });
}

export function checklistItemsFromTemplate(template: Template): ChecklistItem[] {
  return parseChecklistBody(template.body).items.map((item) => ({
    id: uid(),
    text: item.text,
    done: false,
  }));
}

export function applyChecklistToWorkspace(ws: Workspace, template: Template): Workspace {
  return applyChecklistItems(
    ws,
    template.title.trim() || "Checklist",
    checklistItemsFromTemplate(template),
  );
}
