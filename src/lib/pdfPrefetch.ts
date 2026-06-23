import type { DocumentDef } from './mockData';
import { detectViewerSource, getPdfProxyUrl } from './viewerUtils';
import { isStaticSite } from './runtimeConfig';

// Docs whose full PDF has already been warmed into the HTTP cache this session.
const warmedDocuments = new Set<string>();
// Docs whose server search index has been warmed (so in-viewer search is ready).
const warmedIndexes = new Set<string>();
let viewerRoutePromise: Promise<unknown> | null = null;
let globalPrefetchStarted = false;

type NetInfo = { saveData?: boolean; effectiveType?: string };
function getConnection(): NetInfo | undefined {
  return (navigator as Navigator & { connection?: NetInfo }).connection;
}

// Heavy (full-file) prefetch is aggressive by design (PDF speed is the
// priority). Only back off on explicitly metered ("save data") connections or
// genuinely tiny 2g links; 3g/4g/wifi/unknown all proceed.
function connectionAllowsHeavyPrefetch(): boolean {
  const c = getConnection();
  if (!c) return true;
  if (c.saveData) return false;
  if (c.effectiveType && /(^|\b)(slow-2g|2g)\b/.test(c.effectiveType)) return false;
  return true;
}

export function prefetchViewerRoute() {
  if (!viewerRoutePromise) {
    viewerRoutePromise = import('../pages/ViewerPage').catch((error) => {
      viewerRoutePromise = null;
      throw error;
    });
  }
  return viewerRoutePromise;
}

function isPrefetchablePdf(doc: DocumentDef) {
  const source = detectViewerSource(doc.fileUrl || doc.externalUrl || '');
  return source.type === 'pdf-url' ? source : null;
}

// Warm the server-side search index (small JSON) so the in-viewer search works
// the instant the PDF opens — even before the user enters the viewer.
function warmSearchIndex(doc: DocumentDef) {
  if (isStaticSite) return Promise.resolve();
  if (warmedIndexes.has(doc.id)) return Promise.resolve();
  warmedIndexes.add(doc.id);
  const opts: RequestInit & { priority?: 'low' } = { cache: 'force-cache' };
  if ('priority' in Request.prototype) opts.priority = 'low';
  return fetch(`/api/documents/${encodeURIComponent(doc.id)}/search-index`, opts)
    .then(() => undefined)
    .catch(() => {
      warmedIndexes.delete(doc.id);
    });
}

// Download the FULL pdf into the immutable HTTP cache by draining the stream
// (keeps memory flat — bytes are discarded, the browser cache keeps the file).
// Once warmed, the viewer's range requests are served instantly from cache.
async function warmPdfFile(doc: DocumentDef, priority: 'high' | 'low' = 'low') {
  const source = isPrefetchablePdf(doc);
  if (!source) return;
  if (warmedDocuments.has(doc.id)) return;
  warmedDocuments.add(doc.id);

  const url = getPdfProxyUrl(source.value);
  const opts: RequestInit & { priority?: 'high' | 'low' } = { cache: 'force-cache' };
  if ('priority' in Request.prototype) opts.priority = priority;

  try {
    const res = await fetch(url, opts);
    if (!res.ok || !res.body) {
      warmedDocuments.delete(doc.id);
      return;
    }
    const reader = res.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch {
    warmedDocuments.delete(doc.id);
  }
}

// Simple concurrency pool.
async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<unknown>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        /* ignore */
      }
    }
  });
  await Promise.all(workers);
}

// Hover / intent: warm the viewer chunk + this PDF at HIGH priority right away.
export function prefetchPdfDocument(doc: DocumentDef) {
  void prefetchViewerRoute().catch(() => undefined);
  void warmSearchIndex(doc);
  if (!connectionAllowsHeavyPrefetch()) return;
  void warmPdfFile(doc, 'high');
}

/**
 * Background warmer kicked off after the catalog list loads. It aggressively
 * preloads PDFs so they are ready BEFORE the user opens them:
 *   1. Warm ALL search indexes first (cheap) -> search is instant everywhere.
 *   2. Preload the viewer route chunk.
 *   3. Stream every catalog PDF into the immutable HTTP cache (featured first),
 *      with limited concurrency so the network isn't saturated.
 * The home page is allowed to feel slightly heavier in exchange for instant
 * PDF opening afterwards, exactly as requested.
 */
export function startGlobalPdfPrefetch(docs: DocumentDef[]) {
  if (globalPrefetchStarted || !Array.isArray(docs) || docs.length === 0) return;
  globalPrefetchStarted = true;

  const ready = docs.filter((d) => (!d.status || d.status === 'ready') && isPrefetchablePdf(d));
  if (ready.length === 0) return;

  const run = async () => {
    // 1. Search indexes (small, fast) — makes "buscar" usable immediately.
    await runPool(ready, 4, warmSearchIndex);

    // 2. Viewer route chunk.
    void prefetchViewerRoute().catch(() => undefined);

    // 3. Full PDFs — only on capable connections; featured catalogs first.
    if (!connectionAllowsHeavyPrefetch()) return;
    const ordered = [...ready].sort(
      (a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)
    );
    await runPool(ordered, 2, (d) => warmPdfFile(d, 'low'));
  };

  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) {
    ric(() => void run(), { timeout: 3000 });
  } else {
    setTimeout(() => void run(), 1200);
  }
}
