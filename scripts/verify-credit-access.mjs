import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const storage = new Map();
const scope = {
  exports: {},
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  window: { sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }, dispatchEvent: () => {} },
};
function load(file, imports = {}) {
  const context = vm.createContext({ ...scope, exports: {}, require: key => imports[key] });
  const source = fs.readFileSync(new URL('../src/lib/' + file, import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const credit = load('creditAccess.ts');
const distributor = load('distributorAccess.ts', { './creditAccess': credit });
const quality = load('catalogQuality.ts', { './creditAccess': credit, './distributorAccess': distributor });
for (const category of ['Crédito', 'credito', ' CRÉDITO ', 'Historial de lista de precios', 'Catálogo de Distribuidores']) {
  assert.equal(quality.supportsHighQuality(category), true);
  assert.equal(quality.usesHighQuality({ category, highQuality: true }), true);
  assert.equal(quality.usesHighQuality({ category, highQuality: false }), false);
}
assert.equal(quality.usesHighQuality({ category: 'Catálogo de Productos', highQuality: true }), false);
assert.equal(quality.usesHighQuality(null), false);
for (const category of ['Crédito', 'Historial de lista de precios']) {
  assert.equal(credit.isCreditCategory(undefined, category), true);
  assert.equal(distributor.canViewDistributorDocument({ category }, 'viewer'), true);
}
assert.equal(distributor.canViewDistributorDocument({ category: 'Catálogo de Distribuidores' }, 'viewer'), false);
for (const file of ['pages/CategoryPage.tsx', 'pages/ViewerPage.tsx']) {
  const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /CreditAccessGate|hasCreditAccess/);
}
console.log('PASS: price history is accessible without a distributor session and retains original-quality support');
