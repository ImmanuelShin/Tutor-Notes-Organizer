import { invoke } from "@tauri-apps/api/core";
import { readFileBytes } from "./media";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export async function pdfFirstPageThumb(relative: string, maxWidth = 360): Promise<string> {
  const hit = cache.get(relative);
  if (hit) return hit;
  const pending = inflight.get(relative);
  if (pending) return pending;

  const task = render(relative, maxWidth);
  inflight.set(relative, task);
  try {
    const url = await task;
    cache.set(relative, url);
    return url;
  } finally {
    inflight.delete(relative);
  }
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

async function render(relative: string, maxWidth: number): Promise<string> {
  const abs = await invoke<string>("resolve_app_file", { relative });
  const bytes = await readFileBytes(abs);
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / Math.max(1, unscaled.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a canvas for the PDF preview.");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }
}
