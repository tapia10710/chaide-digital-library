import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker once (idempotent — shared module instance).
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

/**
 * Process-wide cache of parsed PDF documents AND rendered page bitmaps, keyed by
 * URL. It survives React route changes (the viewer unmounting), so a catalog the
 * user already opened stays loaded: re-opening it is instant — no re-download,
 * no re-parse, no re-render. Once the active document is loaded we also preload
 * the OTHER catalogs in the background without evicting the ones already loaded.
 *
 * Memory is intentionally favoured for speed; an LRU cap keeps it bounded.
 */

const MAX_DOCS = 8;

type DocEntry = {
  url: string;
  promise: Promise<pdfjsLib.PDFDocumentProxy>;
  proxy?: pdfjsLib.PDFDocumentProxy;
  lastUsed: number;
};

const documents = new Map<string, DocEntry>();
const bitmaps = new Map<string, Map<number, { bitmap: ImageBitmap; w: number; h: number }>>();

type ProgressFn = (p: { loaded: number; total: number }) => void;

function buildTask(url: string) {
  return pdfjsLib.getDocument({
    url,
    disableAutoFetch: true,
    disableStream: false,
    rangeChunkSize: 262144,
    cMapUrl: `${window.location.origin}${import.meta.env.BASE_URL}cmaps/`,
    cMapPacked: true,
  });
}

function evict() {
  if (documents.size <= MAX_DOCS) return;
  const sorted = [...documents.values()].sort((a, b) => a.lastUsed - b.lastUsed);
  while (documents.size > MAX_DOCS && sorted.length) {
    const victim = sorted.shift();
    if (!victim) break;
    documents.delete(victim.url);
    // Release rendered bitmaps for the evicted doc.
    const m = bitmaps.get(victim.url);
    if (m) {
      m.forEach((v) => { try { v.bitmap.close?.(); } catch { /* noop */ } });
      bitmaps.delete(victim.url);
    }
    victim.promise.then((p) => { try { p.destroy(); } catch { /* noop */ } }).catch(() => undefined);
  }
}

/** Return the already-parsed document if cached (no work), else null. */
export function getCachedDocument(url: string): pdfjsLib.PDFDocumentProxy | null {
  const e = documents.get(url);
  if (e?.proxy) {
    e.lastUsed = Date.now();
    return e.proxy;
  }
  return null;
}

/** Load (or reuse) a parsed document. Cached docs resolve instantly. */
export function loadDocument(url: string, onProgress?: ProgressFn): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = documents.get(url);
  if (existing) {
    existing.lastUsed = Date.now();
    if (onProgress) onProgress({ loaded: 1, total: 1 });
    return existing.promise;
  }

  const task = buildTask(url);
  if (onProgress) {
    task.onProgress = onProgress as any;
  }
  const promise = task.promise.then((p) => {
    const ent = documents.get(url);
    if (ent) ent.proxy = p;
    return p;
  });

  documents.set(url, { url, promise, lastUsed: Date.now() });
  evict();
  return promise;
}

let preloading = false;
/**
 * After the active catalog is loaded, parse the OTHER catalogs in the background
 * so opening any of them is instant too. Already-cached docs are skipped, and
 * nothing already loaded is evicted (unless the LRU cap is exceeded).
 */
export async function preloadDocuments(urls: string[]) {
  if (preloading) return;
  preloading = true;
  try {
    for (const url of urls) {
      if (!url || documents.has(url)) continue;
      try {
        await loadDocument(url);
      } catch { /* ignore individual failures */ }
      // Small yield between docs so the active viewer keeps priority.
      await new Promise((r) => setTimeout(r, 60));
    }
  } finally {
    preloading = false;
  }
}

/** Rendered-bitmap cache so re-opening a viewed page paints with zero delay. */
export function getRenderedBitmap(url: string, page: number) {
  return bitmaps.get(url)?.get(page) || null;
}

export function setRenderedBitmap(url: string, page: number, bitmap: ImageBitmap, w: number, h: number) {
  let m = bitmaps.get(url);
  if (!m) {
    m = new Map();
    bitmaps.set(url, m);
  }
  const old = m.get(page);
  if (old) { try { old.bitmap.close?.(); } catch { /* noop */ } }
  m.set(page, { bitmap, w, h });
}
