import { del, get, set } from 'idb-keyval';

// Enough for one large catalogue, but bounded so the browser is not filled by
// every PDF ever opened. Browsers may still evict site storage under pressure.
const MAX_BYTES = 192 * 1024 * 1024;
const INDEX_KEY = 'chaide_pdf_range_index_v1';
const PREFIX = 'chaide_pdf_range_v1_';

type Entry = { key: string; size: number };
type SavedChunk = { bytes: Uint8Array; sha256: string };
let writes: Promise<void> = Promise.resolve();
let queued = 0;

const chunkKey = (id: string, version: string, index: number) =>
  `${PREFIX}${encodeURIComponent(id)}_${encodeURIComponent(version)}_${index}`;

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function readPersistentPdfChunk(id: string, version: string, index: number, size: number) {
  if (!id || !version) return null;
  const key = chunkKey(id, version, index);
  try {
    // A reload in the same tab can happen while its previous write is pending.
    await writes;
    const saved = await get<SavedChunk>(key);
    if (!saved?.sha256 || !(saved.bytes instanceof Uint8Array) || saved.bytes.byteLength !== size) return null;
    if (await sha256(saved.bytes) !== saved.sha256) {
      await del(key).catch(() => undefined);
      return null;
    }
    return saved.bytes;
  } catch {
    return null;
  }
}

export function savePersistentPdfChunk(id: string, version: string, index: number, bytes: Uint8Array, hash?: string) {
  if (!id || !version || !bytes.byteLength || queued >= 12) return;
  const key = chunkKey(id, version, index);
  queued++;
  writes = writes.catch(() => undefined).then(async () => {
    try {
      const indexEntries = (await get<Entry[]>(INDEX_KEY)) || [];
      const next = indexEntries.filter(entry => entry.key !== key);
      let total = next.reduce((sum, entry) => sum + entry.size, 0);
      while (total + bytes.byteLength > MAX_BYTES && next.length) {
        const oldest = next.shift()!;
        await del(oldest.key);
        total -= oldest.size;
      }
      if (bytes.byteLength > MAX_BYTES) return;
      const saved = { bytes, sha256: hash || await sha256(bytes) } satisfies SavedChunk;
      try {
        await set(key, saved);
      } catch {
        // The browser may grant less than our nominal budget. Free older PDF
        // fragments once and retry without blocking the viewer.
        while (next.length && total > MAX_BYTES / 2) {
          const oldest = next.shift()!;
          await del(oldest.key);
          total -= oldest.size;
        }
        await set(INDEX_KEY, next);
        await set(key, saved);
      }
      next.push({ key, size: bytes.byteLength });
      await set(INDEX_KEY, next);
    } catch {
      // Private browsing, quota limits and disabled IndexedDB must not stop
      // an otherwise valid PDF from opening. The network remains the fallback.
    } finally {
      queued--;
    }
  });
}
