// Decimal MB, matching the administrator's 40 MB threshold.
export const PARTIAL_PDF_THRESHOLD = 40_000_000;
export const shouldLoadPdfPartially = (size?: number) => Number.isFinite(size) && size! > PARTIAL_PDF_THRESHOLD;

export function parseFirestorePdfUrl(url: string) {
  if (!url.startsWith('firestore-pdf://')) throw new Error('Origen PDF no válido.');
  const source = url.slice('firestore-pdf://'.length);
  const [id, query = ''] = source.split('?');
  if (!id || id.includes('/')) throw new Error('Identificador PDF no válido.');
  return { id, version: new URLSearchParams(query).get('version') || undefined };
}

/** Reuses overlapping requests, with bounded reads and a small byte cache. */
export function createPdfRangeReader(
  size: number,
  chunkSize: number,
  readChunk: (index: number) => Promise<Uint8Array>,
) {
  if (!Number.isSafeInteger(size) || size <= 0 || !Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Tamaño de PDF no válido.');
  }
  const cache = new Map<number, Uint8Array>();
  const pending = new Map<number, Promise<Uint8Array>>();
  const waiting: Array<() => void> = [];
  let active = 0;
  let closed = false;
  const checkOpen = () => { if (closed) throw new Error('Carga de PDF cancelada.'); };
  async function chunk(index: number): Promise<Uint8Array> {
    checkOpen();
    const cached = cache.get(index);
    if (cached) { cache.delete(index); cache.set(index, cached); return cached; }
    if (pending.has(index)) return pending.get(index)!;
    const request = (async () => {
      if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve));
      else active++;
      try {
        checkOpen();
        const bytes = await readChunk(index);
        checkOpen();
        if (bytes.byteLength !== Math.min(chunkSize, size - index * chunkSize)) {
          throw new Error('Un fragmento del PDF está incompleto.');
        }
        cache.set(index, bytes);
        while (cache.size > 16) cache.delete(cache.keys().next().value!);
        return bytes;
      } finally {
        const next = waiting.shift();
        if (next) next(); else active--;
      }
    })();
    pending.set(index, request);
    try { return await request; } finally { pending.delete(index); }
  }
  return {
    async read(begin: number, end: number) {
      checkOpen();
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > size) {
        throw new Error('Rango PDF no válido.');
      }
      const output = new Uint8Array(end - begin);
      // Batches avoid creating thousands of queued promises for oversized ranges.
      const first = Math.floor(begin / chunkSize);
      const last = Math.floor((end - 1) / chunkSize);
      for (let start = first; start <= last; start += 4) {
        await Promise.all(Array.from({ length: Math.min(4, last - start + 1) }, async (_, offset) => {
          const index = start + offset;
          const bytes = await chunk(index);
          const from = Math.max(begin, index * chunkSize);
          const to = Math.min(end, (index + 1) * chunkSize);
          output.set(bytes.subarray(from - index * chunkSize, to - index * chunkSize), from - begin);
        }));
      }
      return output;
    },
    close() { closed = true; cache.clear(); },
  };
}
