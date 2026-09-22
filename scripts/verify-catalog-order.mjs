import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const scope = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/catalogOrder.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, scope);
const { compareCatalogOrder, parsePublicationOrder } = scope.exports;
const doc = (id, createdAt, publicationOrder) => ({ id, title: id, createdAt, publicationOrder });
const list = [doc('old', '2025-01-01'), doc('second', '2024-01-01', 2), doc('new', '2026-09-22'),
  doc('first', '2023-01-01', 1), doc('undated', 'invalid'), doc('tie', '2025-01-01', 2)];
assert.deepEqual([...list].sort(compareCatalogOrder).map(d => d.id), ['first', 'tie', 'second', 'new', 'old', 'undated']);
assert.equal(parsePublicationOrder(''), 0);
assert.equal(parsePublicationOrder('0'), 0);
assert.equal(parsePublicationOrder('23'), 23);
for (const value of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) assert.throws(() => parsePublicationOrder(value));
assert.equal(compareCatalogOrder(doc('a', '', 0), doc('a', '')), 0);
console.log('PASS: manual order, newest-first fallback, date ties, missing dates and order validation.');
