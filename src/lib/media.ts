import { convertFileSrc, invoke } from "@tauri-apps/api/core";

let cachedAppData: string | null = null;

export async function getAppDataPath(): Promise<string> {
  if (!cachedAppData) {
    cachedAppData = await invoke<string>("get_app_data_dir");
  }
  return cachedAppData;
}

export function isRelativeMedia(src: string): boolean {
  return src.startsWith("media/") || src.startsWith("pdfs/");
}

export async function toDisplaySrc(src: string): Promise<string> {
  if (!src) return src;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("asset:") ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  ) {
    return src;
  }
  const relative = src.replace(/^\.?[/\\]/, "");
  const abs = await invoke<string>("resolve_app_file", { relative });
  return convertFileSrc(abs);
}

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
};

export async function hydrateDoc(json: string): Promise<string> {
  try {
    const doc = JSON.parse(json) as JsonNode;
    await walkImages(doc, async (node) => {
      const src = String(node.attrs?.src ?? "");
      const stored = String(node.attrs?.path ?? src);
      if (isRelativeMedia(stored) || isRelativeMedia(src)) {
        const relative = isRelativeMedia(stored) ? stored : src;
        node.attrs = {
          ...node.attrs,
          src: await toDisplaySrc(relative),
          path: relative,
        };
      }
    });
    return JSON.stringify(doc);
  } catch {
    return json;
  }
}

export function dehydrateDoc(json: string): string {
  try {
    const doc = JSON.parse(json) as JsonNode;
    walkImagesSync(doc, (node) => {
      const path = node.attrs?.path;
      if (typeof path === "string" && path) {
        node.attrs = { ...node.attrs, src: path };
      }
    });
    return JSON.stringify(doc);
  } catch {
    return json;
  }
}

async function walkImages(
  node: JsonNode,
  visit: (node: JsonNode) => Promise<void>,
): Promise<void> {
  if (node.type === "image") await visit(node);
  if (node.content) {
    for (const child of node.content) await walkImages(child, visit);
  }
}

function walkImagesSync(node: JsonNode, visit: (node: JsonNode) => void): void {
  if (node.type === "image") visit(node);
  node.content?.forEach((child) => walkImagesSync(child, visit));
}

export async function deleteAppFile(relative: string): Promise<void> {
  if (!isRelativeMedia(relative)) return;
  await invoke("delete_app_file", { relative });
}

export async function savePastedImage(
  dataBase64: string,
  mime: string,
): Promise<string> {
  return invoke<string>("save_pasted_image", { dataBase64, mime });
}

export async function importPdf(source: string): Promise<string> {
  return invoke<string>("import_pdf", { source });
}

export async function importImage(source: string): Promise<string> {
  return invoke<string>("import_image", { source });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(path);
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}

async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  return png ?? blob;
}

export async function copyStoredImage(relative: string): Promise<void> {
  const abs = await invoke<string>("resolve_app_file", { relative });
  const bytes = await readFileBytes(abs);
  const payload = new Uint8Array(bytes);
  const raw = new Blob([payload], { type: mimeFromPath(relative) });
  const png = await toPngBlob(raw);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function openAppFile(relative: string): Promise<void> {
  await invoke("open_app_file", { relative });
}

export async function openExternalUrl(url: string): Promise<void> {
  await invoke("open_url", { url });
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  return new Uint8Array(bytes);
}
