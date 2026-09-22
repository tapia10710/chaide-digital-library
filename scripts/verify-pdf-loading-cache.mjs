import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// Exercise the production loader with deterministic storage/network boundaries.
const source = fs.readFileSync(new URL('../src/lib/firebaseCatalog.ts', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('export async function loadPdfFromFirestore('), source.indexOf('function fileToBase64('));
const js = ts.transpileModule(loader.replace('export async', 'async'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const bytes = new TextEncoder().encode('%PDF-1.7\nverified test payload');
const hash = async data => Buffer.from(await webcrypto.subtle.digest('SHA-256', data)).toString('hex');
const sha256 = await hash(bytes);

async function run(cache, version = 'v1', persist = async () => {}) {
  let reads = 0;
  let writes = 0;
  const manifest = { size: bytes.length, version: 'v1', sha256, chunkCount: 1 };
  const scope = {
    Uint8Array, TextDecoder, Blob, URL, console,
    db: {}, doc: () => ({}), collection: () => ({}), query: () => ({}), where: () => ({}),
    getCachedValue: async () => cache,
    sha256Hex: hash,
    getDoc: async () => { reads++; return { exists: () => true, data: () => manifest }; },
    getDocs: async () => { reads++; return { docs: [{ data: () => ({ index: 0, version: 'v1', data: { toUint8Array: () => bytes } }) }] }; },
    cacheFirestorePdf: async () => { writes++; await persist(); },
  };
  vm.createContext(scope);
  vm.runInContext(js, scope);
  const url = await scope.loadPdfFromFirestore('test', undefined, version);
  assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), bytes);
  URL.revokeObjectURL(url);
  return { reads, writes };
}
assert.equal((await run({ bytes, version: 'v1', sha256 })).reads, 0, 'verified version must avoid network');
assert.equal((await run(undefined)).reads, 2, 'cold load must validate manifest and chunks');
assert.equal((await run({ bytes: new Uint8Array([1, 2]), version: 'v1', sha256 })).reads, 2, 'corruption must use network');
assert.ok((await run({ bytes, version: 'old', sha256 })).reads > 0, 'different version must not bypass manifest');
assert.equal((await run(bytes)).reads, 1, 'legacy cache remains readable after validation');
assert.equal((await run(undefined, 'v1', () => new Promise(() => {}))).writes, 1, 'slow persistence must not block display');
console.log('PASS: verified cache, cold load, corruption, version change, legacy cache and nonblocking persistence');
