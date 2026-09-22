import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const storage = new Map();
let now = Date.now();
const scope = {
  exports: {}, crypto: webcrypto, TextEncoder,
  Date: { now: () => now },
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
assert.equal(await credit.verifyCreditPassword('CREDITO2026'), true);
assert.equal(await credit.verifyCreditPassword('incorrecta'), false);
assert.equal(credit.hasCreditAccess(), false);
assert.equal(distributor.canViewDistributorDocument({ category: 'Crédito' }, 'viewer'), false);
distributor.grantDistributorAccess();
assert.equal(credit.hasCreditAccess(), false, 'distributor session must not grant credit');
credit.grantCreditAccess();
assert.equal(distributor.canViewDistributorDocument({ category: 'Crédito' }, 'viewer'), true);
credit.clearCreditAccess();
assert.equal(credit.hasCreditAccess(), false);
assert.equal(distributor.hasDistributorAccess(), true, 'credit logout must not close distributor session');
credit.grantCreditAccess();
now += credit.CREDIT_ACCESS_TIMEOUT_MS + 1;
assert.equal(credit.hasCreditAccess(), false, 'inactive session expires');
assert.equal(distributor.canViewDistributorDocument({ category: 'Crédito' }, 'admin'), true);
console.log('PASS: password, visual filtering, independent sessions, logout, expiration and administrator');
