import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
function load(source, extra = {}) {
  const scope = vm.createContext({ exports: {}, Uint8Array, URL, URLSearchParams, Blob, TextDecoder, console,
    setTimeout, clearTimeout, crypto: webcrypto,
    window: { location: { origin: 'https://test.invalid' } }, ...extra });
  vm.runInContext(compile(source), scope);
  return scope.exports;
}
const partialSource = fs.readFileSync(new URL('../src/lib/pdfPartialLoading.ts', import.meta.url), 'utf8');
const partial = load(partialSource);
assert.equal(partial.shouldLoadPdfPartially(40_000_000), false);
assert.equal(partial.shouldLoadPdfPartially(40_000_001), true);
assert.equal(partial.shouldLoadPdfPartially(undefined), false);
const sourceBytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
let reads = 0, active = 0, peak = 0;
const reader = partial.createPdfRangeReader(1000, 100, async index => {
  reads++; peak = Math.max(peak, ++active);
  await new Promise(resolve => setTimeout(resolve, 2)); active--;
  return sourceBytes.slice(index * 100, (index + 1) * 100);
});
const [a, b] = await Promise.all([reader.read(20, 450), reader.read(200, 999)]);
assert.deepEqual(a, sourceBytes.slice(20, 450));
assert.deepEqual(b, sourceBytes.slice(200, 999));
assert.equal(reads, 10, 'Overlapping reads share a single request');
assert.ok(peak <= 4);
reader.close();
await assert.rejects(reader.read(0, 100), /cancelada/);
await assert.rejects(partial.createPdfRangeReader(100, 100, async () => new Uint8Array(3)).read(0, 100), /incompleto/);

// A real >40 MB PDF with searchable pages plus a large unused resource.
// It intentionally allows proof that a selected page does not need all bytes.
const original = await PDFDocument.create();
const font = await original.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 12; i++) original.addPage([400, 600]).drawText(`Catalogo pagina ${i}`, { font, size: 20 });
original.catalog.set(PDFName.of('TestPayload'), original.context.register(original.context.stream(new Uint8Array(41_000_000))));
const bytes = await original.save({ useObjectStreams: false });
assert.ok(bytes.length > 40_000_000);
const chunkSize = 700 * 1024;
const hash = async data => Buffer.from(await webcrypto.subtle.digest('SHA-256', data)).toString('hex');
class Bytes { constructor(data) { this.bytes = data; } toUint8Array() { return this.bytes; } }
let transferred = 0, failReads = false, corrupt = false, fullLoads = 0;
const firebaseSource = fs.readFileSync(new URL('../src/lib/firebaseCatalog.ts', import.meta.url), 'utf8');
const rangeSource = firebaseSource.slice(firebaseSource.indexOf('export async function openFirestorePdfRanges('), firebaseSource.indexOf('export async function loadPdfFromFirestore('));
const ranges = load(rangeSource, { ...partial, Bytes, PDF_CHUNK_BYTES: chunkSize, db: {}, doc: (...args) => args,
  sha256Hex: hash,
  async getDoc(path) {
    if (!path.includes('chunks')) return { exists: () => true, data: () => ({ size: bytes.length, version: 'v1', chunkCount: Math.ceil(bytes.length / chunkSize), chunkSize, chunkHashes: true }) };
    if (failReads) return { exists: () => false };
    const index = Number(path.at(-1).split('-').at(-1));
    const part = bytes.slice(index * chunkSize, (index + 1) * chunkSize);
    transferred += part.length;
    const digest = await hash(part);
    return { exists: () => true, data: () => ({ index, version: 'v1', data: new Bytes(part), sha256: corrupt ? 'invalid' : digest }) };
  },
});
const catalog = { ...ranges, async loadPdfFromFirestore() {
  fullLoads++;
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
} };
const cacheSource = fs.readFileSync(new URL('../src/lib/pdfCache.ts', import.meta.url), 'utf8')
  .replaceAll('import.meta.env.BASE_URL', "'/'").replaceAll('import.meta.url', "'file:///test/pdfCache.js'");
const transports = [];
const cache = load(cacheSource, { require: name => {
  if (name === 'pdfjs-dist') return { ...pdfjs, getDocument: options => {
    if (options.range) transports.push(options.range);
    return pdfjs.getDocument(
    // Node's PDF.js transport cannot fetch blob: URLs; use the same original bytes.
    options.url?.startsWith('blob:') ? { ...options, url: undefined, data: bytes.slice() } : options,
    );
  } };
  if (name === './pdfPartialLoading') return partial;
  if (name === './firebaseCatalog') return catalog;
  throw new Error(name);
} });
const url = 'firestore-pdf://test?version=v1';
const pdf = await cache.loadDocument(url, undefined, true);
assert.equal(pdf.numPages, 12);
const page = await pdf.getPage(9);
assert.match((await page.getTextContent()).items.map(item => item.str).join(''), /pagina 9/);
const firstPage = await pdf.getPage(1);
assert.match((await firstPage.getTextContent()).items.map(item => item.str).join(''), /pagina 1/);
assert.equal(fullLoads, 0);
assert.ok(transferred < bytes.length / 2, `Partial loading fetched ${transferred} of ${bytes.length}`);
console.log(`PASS: actual PDF.js opens and navigates a ${(bytes.length / 1e6).toFixed(1)} MB PDF after reading ${(transferred / 1e6).toFixed(1)} MB; searchable text retained.`);
const beforeCached = transferred;
assert.equal(await cache.loadDocument(url, undefined, true), pdf);
assert.equal(transferred, beforeCached);

corrupt = true;
const bad = await ranges.openFirestorePdfRanges(url);
await assert.rejects(bad.read(0, 100), /integridad/);
bad.close(); corrupt = false;
failReads = true;
let recovered = false;
const stopRecovery = cache.subscribePdfRecovery(url, () => { recovered = true; });
transports[0].requestDataRange(chunkSize * 10, chunkSize * 11);
for (let attempt = 0; attempt < 50 && !recovered; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(recovered, true, 'A failure after initial display notifies the mounted viewer');
assert.equal(cache.getCachedDocument(url, true), null, 'A broken proxy must not be reused');
stopRecovery();
const fallback = await Promise.race([
  cache.loadDocument('firestore-pdf://fallback?version=v1'),
  new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Fallback hung')), 15_000); timer.unref(); }),
]);
assert.equal(fallback.numPages, 12);
assert.equal(fullLoads, 1, 'Missing chunk triggers full-file recovery');
await pdf.destroy(); await fallback.destroy();
console.log('PASS: threshold, overlap deduplication, bounded concurrency, cache reuse, cancellation, corruption checks and automatic full-file fallback.');
