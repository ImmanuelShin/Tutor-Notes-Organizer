import { open } from "@tauri-apps/plugin-dialog";
import { createResource } from "../db/resources";
import { fileToDataUrl, importImage, importPdf, isImagePath, savePastedImage } from "./media";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"];
export const IMAGE_EXTS = IMAGE_EXTENSIONS.map((ext) => `.${ext}`);

export function stemFromPath(path: string): string {
  return path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "Image";
}

export type ImportFilesOpts = {
  ownerStudentId?: number;
};

export async function importPaths(paths: string[], opts?: ImportFilesOpts): Promise<number[]> {
  const ids: number[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".pdf")) {
      const file_path = await importPdf(path);
      const name = path.split(/[/\\]/).pop()?.replace(/\.pdf$/i, "") || "PDF";
      ids.push(
        await createResource({
          type: "pdf",
          title: name,
          file_path,
          owner_student_id: opts?.ownerStudentId ?? null,
        }),
      );
    } else if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
      const file_path = await importImage(path);
      ids.push(
        await createResource({
          type: "image",
          title: stemFromPath(path),
          file_path,
          owner_student_id: opts?.ownerStudentId ?? null,
        }),
      );
    }
  }
  return ids;
}

export async function importClipboardImages(files: File[], opts?: ImportFilesOpts): Promise<number[]> {
  const ids: number[] = [];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const file_path = await savePastedImage(dataUrl, file.type || "image/png");
    const title =
      file.name && !file.name.startsWith("image.") ? stemFromPath(file.name) : "Pasted image";
    ids.push(
      await createResource({
        type: "image",
        title,
        file_path,
        owner_student_id: opts?.ownerStudentId ?? null,
      }),
    );
  }
  return ids;
}

export function clipboardImageFiles(e: ClipboardEvent): File[] {
  const files: File[] = [];
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (!files.length && e.clipboardData?.files) {
    files.push(
      ...[...e.clipboardData.files].filter((f) => f.type.startsWith("image/") || isImagePath(f.name)),
    );
  }
  return files;
}

function asPathList(selected: string | string[] | null): string[] {
  if (selected == null) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickPdfPaths(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return asPathList(selected);
}

export async function pickImagePaths(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  });
  return asPathList(selected);
}

export async function pickAssignmentPaths(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [
      { name: "PDFs and images", extensions: ["pdf", ...IMAGE_EXTENSIONS] },
    ],
  });
  return asPathList(selected);
}
