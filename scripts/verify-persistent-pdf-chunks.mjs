import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const values = new Map();
const database = {
  get: async key => values.get(key),
  set: async (key, value) => { values.set(key, value); },
  del: async key => { values.delete(key); },
};
const source = fs.readFileSync(new URL('../src/lib/pdfPersistentChunks.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const context = vm.createContext({
  exports: {}, require: name => {
    assert.equal(name, 'idb-keyval');
    return database;
  }, crypto: webcrypto, Uint8Array,
});
vm.runInContext(compiled, context);
const cache = context.exports;
const bytes = Uint8Array.from({ length: 1024 }, (_, index) => index % 251);
cache.savePersistentPdfChunk('catalog', 'first-version', 0, bytes);
assert.deepEqual(await cache.readPersistentPdfChunk('catalog', 'first-version', 0, bytes.length), bytes);
assert.equal(await cache.readPersistentPdfChunk('catalog', 'next-version', 0, bytes.length), null);
assert.equal(await cache.readPersistentPdfChunk('catalog', 'first-version', 0, bytes.length + 1), null);

const savedKey = [...values.keys()].find(key => key.includes('first-version'));
assert.ok(savedKey);
values.set(savedKey, { bytes: Uint8Array.from(bytes, value => value ^ 1), sha256: values.get(savedKey).sha256 });
assert.equal(await cache.readPersistentPdfChunk('catalog', 'first-version', 0, bytes.length), null);

cache.savePersistentPdfChunk('catalog', 'next-version', 0, bytes);
assert.deepEqual(await cache.readPersistentPdfChunk('catalog', 'next-version', 0, bytes.length), bytes);
console.log('PASS: verified PDF fragments survive a new reader, reject corruption and remain isolated by publication version.');
