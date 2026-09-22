import * as pdfjsLib from 'pdfjs-dist';
import { parseFirestorePdfUrl } from './pdfPartialLoading';

// Configure the worker once (idempotent — shared module instance).
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

/**
 * Process-wide cache of parsed PDF documents AND rendered page bitmaps, keyed by
 * URL. It keeps only the current and most recently used catalog so reopening
 * either one is quick without allowing old documents to consume memory.
 *
 * Memory is intentionally favoured for speed; an LRU cap keeps it bounded.
 */

const MAX_DOCS = 2;
// Keep a small hot set. Large, image-heavy catalogues can otherwise retain
// hundreds of MB in GPU-backed ImageBitmaps and Chrome may silently blank a
// canvas when it runs out of graphics memory.
const MAX_BITMAPS_PER_DOC = 6;

type DocEntry = {
  url: string;
  promise: Promise<pdfjsLib.PDFDocumentProxy>;
  proxy?: pdfjsLib.PDFDocumentProxy;
  lastUsed: number;
};

const documents = new Map<string, DocEntry>();
const bitmaps = new Map<string, Map<number, { bitmap: ImageBitmap; w: number; h: number }>>();

type ProgressFn = (p: { loaded: number; total: number }) => void;

const fullLoadingRequired = new Set<string>();
const recoveryListeners = new Map<string, Set<() => void>>();
export function subscribePdfRecovery(url: string, listener: () => void) {
  const listeners = recoveryListeners.get(url) || new Set<() => void>();
  listeners.add(listener);
  recoveryListeners.set(url, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) recoveryListeners.delete(url);
  };
}

async function buildTask(url: string, highQuality = false) {
  let range: pdfjsLib.PDFDataRangeTransport | undefined;
  let blobUrl = '';
  let source = url;
  let chunkSize = 1048576;
  let partialError: Error | undefined;
  let aborted = false;
  let rejectRange: (error: Error) => void = () => {};
  const rangeFailure = new Promise<never>((_, reject) => { rejectRange = reject; });
  let task: pdfjsLib.PDFDocumentLoadingTask | undefined;
  if (url.startsWith('firestore-pdf://')) {
    const { openFirestorePdfRanges, loadPdfFromFirestore, fetchFirebaseDocument, loadPublicDrivePdf } = await import('./firebaseCatalog');
    if (fullLoadingRequired.has(url)) {
      const { id, version } = parseFirestorePdfUrl(url);
      try {
        blobUrl = await loadPdfFromFirestore(id, undefined, version);
      } catch (error) {
        const document = await fetchFirebaseDocument(id);
        if (!document?.externalUrl) throw error;
        blobUrl = await loadPublicDrivePdf(document.externalUrl);
      }
      source = blobUrl;
    } else {
      const reader = await openFirestorePdfRanges(url);
      chunkSize = reader.chunkSize;
      class FirestoreRangeTransport extends pdfjsLib.PDFDataRangeTransport {
        constructor() { super(reader.size, new Uint8Array(0)); }
        requestDataRange(begin: number, end: number) {
          let timeout: ReturnType<typeof setTimeout>;
          const deadline = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('La lectura parcial del PDF tardó demasiado.')), 25_000);
          });
          void Promise.race([reader.read(begin, end), deadline]).then(bytes => {
            if (!partialError && !aborted) this.onDataRange(begin, bytes);
          }).catch(error => {
            if (aborted || partialError) return;
            partialError = error instanceof Error ? error : new Error('No se pudo leer una parte del PDF.');
            fullLoadingRequired.add(url);
            rejectRange(partialError);
            reader.close();
            if (getCachedDocument(url, highQuality)) {
              invalidateDocument(url, highQuality);
              recoveryListeners.get(url)?.forEach(listener => listener());
            }
            // Reject pending PDF.js requests instead of leaving blank pages waiting forever.
            void task?.destroy().catch(() => undefined);
          }).finally(() => clearTimeout(timeout));
        }
        abort() { aborted = true; reader.close(); }
      }
      range = new FirestoreRangeTransport();
    }
  }
  const useNativeImageDecoder = new URL(url, window.location.origin)
    .searchParams.get('fastImageDecoder') === '1';
  task = pdfjsLib.getDocument({
    ...(range ? { range } : { url: source }),
    // Keep the HTTP stream enabled. Some large catalogues contain many
    // cross-reference sections; requesting those in tiny isolated ranges makes
    // pdf.js remain at 0 pages for too long. The document bytes stream once,
    // while page parsing and canvas rendering remain strictly windowed around
    // the page selected by the reader.
    disableAutoFetch: Boolean(range),
    disableStream: Boolean(range),
    rangeChunkSize: chunkSize,
    // Explicitly downsample oversized image layers inside the worker before
    // they reach the main-thread canvas. Layer-heavy catalogues (notably the
    // Zafiro PDF) otherwise decode several 20-80 MB masks at full resolution
    // even though the visible page needs only a fraction of those pixels.
    canvasMaxAreaInBytes: 12 * 1024 * 1024,
    // Preserve source image pixels for explicitly selected original-quality PDFs.
    // Worker-side OffscreenCanvas resizing otherwise discards detail before zoom.
    ...(highQuality ? { isOffscreenCanvasSupported: false } : {}),
    // Chromium disables ImageDecoder by default in pdf.js because arbitrary
    // PDFs may contain problematic colour profiles. Enable it only for our
    // flattened, standard-RGB web derivative, where native JPEG decoding cuts
    // the first paint substantially without changing other catalogues.
    ...(useNativeImageDecoder ? { isImageDecoderSupported: true } : {}),
    cMapUrl: `${window.location.origin}${import.meta.env.BASE_URL}cmaps/`,
    cMapPacked: true,
  });
  if (blobUrl) {
    // PDF.js owns the bytes after loading; the temporary URL need not outlive it.
    void task.promise.then(() => URL.revokeObjectURL(blobUrl), () => URL.revokeObjectURL(blobUrl));
  }
  return { task, promise: range ? Promise.race([task.promise, rangeFailure]) : task.promise };
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
export function getCachedDocument(url: string, highQuality = false): pdfjsLib.PDFDocumentProxy | null {
  url = highQuality ? url + '#original-quality' : url;
  const e = documents.get(url);
  if (e?.proxy) {
    e.lastUsed = Date.now();
    return e.proxy;
  }
  return null;
}

/** Load (or reuse) a parsed document. Cached docs resolve instantly. */
export function loadDocument(url: string, onProgress?: ProgressFn, highQuality = false): Promise<pdfjsLib.PDFDocumentProxy> {
  const sourceUrl = url;
  url = highQuality ? url + '#original-quality' : url;
  const existing = documents.get(url);
  if (existing) {
    existing.lastUsed = Date.now();
    if (onProgress) onProgress({ loaded: 1, total: 1 });
    return existing.promise;
  }

  let task: pdfjsLib.PDFDocumentLoadingTask | undefined;
  const promise = (async () => {
    try {
      const operation = await buildTask(sourceUrl, highQuality);
      task = operation.task;
      if (onProgress) task.onProgress = onProgress;
      return await operation.promise;
    } catch (error) {
      if (!sourceUrl.startsWith('firestore-pdf://')) throw error;
      fullLoadingRequired.add(sourceUrl);
      await task?.destroy().catch(() => undefined);
      const operation = await buildTask(sourceUrl, highQuality);
      task = operation.task;
      if (onProgress) task.onProgress = onProgress;
      return await operation.promise;
    }
  })()
    .then((p) => {
      const ent = documents.get(url);
      if (ent) ent.proxy = p;
      return p;
    })
    .catch((error) => {
      const ent = documents.get(url);
      if (ent?.promise === promise) documents.delete(url);
      void task?.destroy().catch(() => undefined);
      throw error;
    });

  documents.set(url, { url, promise, lastUsed: Date.now() });
  evict();
  return promise;
}

export function invalidateDocument(url: string, highQuality = false) {
  url = highQuality ? url + '#original-quality' : url;
  const entry = documents.get(url);
  if (!entry) return;
  documents.delete(url);
  const renderedPages = bitmaps.get(url);
  renderedPages?.forEach((value) => {
    try { value.bitmap.close?.(); } catch { /* noop */ }
  });
  bitmaps.delete(url);
  void entry.promise
    .then((proxy) => {
      try { proxy.destroy(); } catch { /* noop */ }
    })
    .catch(() => undefined);
}

/** Rendered-bitmap cache so re-opening a viewed page paints with zero delay. */
export function getRenderedBitmap(url: string, page: number) {
  const documentBitmaps = bitmaps.get(url);
  const cached = documentBitmaps?.get(page) || null;
  if (cached && documentBitmaps) {
    // Refresh insertion order so the least recently viewed bitmap is evicted.
    documentBitmaps.delete(page);
    documentBitmaps.set(page, cached);
  }
  return cached;
}

export function setRenderedBitmap(url: string, page: number, bitmap: ImageBitmap, w: number, h: number) {
  let m = bitmaps.get(url);
  if (!m) {
    m = new Map();
    bitmaps.set(url, m);
  }
  const old = m.get(page);
  if (old) { try { old.bitmap.close?.(); } catch { /* noop */ } }
  m.delete(page);
  m.set(page, { bitmap, w, h });

  while (m.size > MAX_BITMAPS_PER_DOC) {
    const oldestPage = m.keys().next().value as number | undefined;
    if (oldestPage === undefined) break;
    const oldest = m.get(oldestPage);
    m.delete(oldestPage);
    try { oldest?.bitmap.close?.(); } catch { /* noop */ }
  }
}
