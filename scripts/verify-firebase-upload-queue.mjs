import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

// Exercise the actual component with isolated hooks and mocked network services.
// No files or records are uploaded to production by this regression test.
const slots = [];
let cursor = 0;
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  },
  useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
  useMemo(fn) { return fn(); },
  useEffect() {},
};
let active = 0;
let maxActive = 0;
const order = [];
const saved = [];
const qualityFlags = [];
const failed = new Set();
let releaseFirst;
const first = new Promise(resolve => { releaseFirst = resolve; });
const store = {
  categories: [{ id: 'credito', name: 'Crédito' }], documents: [], isLoadingDocs: false,
  addDocument(value) { saved.push(value); }, async fetchDocuments() {},
};
const imports = {
  react: { ...react, default: react },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'lucide-react': {},
  '../../store/useStore': { useStore: () => store },
  '../../lib/categoryStructure': { findFallbackCategory: () => store.categories[0] },
  '../../lib/catalogQuality': { supportsHighQuality: category => category === 'Crédito' },
  '../../lib/firebaseCatalog': {
    async uploadFileToDrive(file) { return { fileId: file.name, downloadUrl: 'test-only' }; },
    async deleteFileFromDrive() {}, async deleteDriveFilesReliably() { return { pending: [] }; },
  },
  '../../lib/catalogSearchIndex': { async preparePdfCatalog(file, _progress, highQuality) {
    qualityFlags.push(highQuality);
    active++; maxActive = Math.max(maxActive, active); order.push(file.name);
    if (file.name === 'uno.pdf') await first;
    active--;
    if (file.name === 'dos.pdf' && !failed.has(file.name)) { failed.add(file.name); throw new Error('Fallo simulado'); }
    return { pageCount: 1, searchablePages: 1, viewerFile: file, indexItems: [], viewerOptimization: { mode: 'original' } };
  } },
  '../../lib/firebaseCatalogPublication': { async publishPreparedFirebasePdf() { return {}; } },
};
const scope = vm.createContext({ exports: {}, require: key => {
  assert.ok(key in imports, `Unexpected import ${key}`); return imports[key];
}, crypto: { randomUUID }, console });
const source = fs.readFileSync(new URL('../src/components/admin/FirebaseUploadPanel.tsx', import.meta.url), 'utf8');
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, scope);
const render = () => { cursor = 0; return scope.exports.default({}); };
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const find = predicate => { const found = nodes(render()).find(predicate); assert.ok(found); return found; };
const file = name => ({ name, size: 1024, type: 'application/pdf', lastModified: 123 });
const event = value => ({ target: { value }, currentTarget: { value } });
function enqueue(names) {
  const files = names.map(file);
  find(n => n.type === 'input' && n.props.accept === 'application/pdf,.pdf').props.onChange({ currentTarget: { files }, target: { value: 'selected' } });
  find(n => n.type === 'select' && n.props['aria-label'] === 'Categoría del catálogo').props.onChange(event('Crédito'));
  find(n => n.type === 'label' && nodes(n).some(child => child.props?.children === 'Cargar en alta calidad (PDF original; puede tardar más)'))
    .props.children[0].props.onChange({ target: { checked: true } });
  find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
}
const queue = () => slots.find(value => Array.isArray(value) && value.some(item => item?.fileName));
enqueue(['uno.pdf', 'dos.pdf', 'tres.pdf', 'tres.pdf']);
assert.equal(queue().length, 3, 'Selection deduplicated');
const start = find(n => n.type === 'button' && n.props.children === 'Iniciar cola').props.onClick;
const running = start();
await start(); // Double click must not launch a second worker.
enqueue(['cuatro.pdf']); // New files can join the running queue.
assert.equal(order.length, 1, 'Only first file runs while pending');
releaseFirst();
await running;
assert.equal(maxActive, 1);
assert.deepEqual(order, ['uno.pdf', 'dos.pdf', 'tres.pdf', 'cuatro.pdf']);
assert.equal(saved.length, 3, 'Error does not block later files');
assert.ok(saved.every(item => item.category === 'Crédito' && item.visibility === 'private'));
assert.equal(new Set(saved.map(item => item.id)).size, 3);
assert.ok(queue().filter(item => item.status === 'done').every(item => item.pdf === null), 'Release completed file memory');
assert.equal(queue().find(item => item.fileName === 'dos.pdf').status, 'error');
find(n => n.type === 'button' && n.props.children === 'Volver a poner en cola').props.onClick();
await find(n => n.type === 'button' && n.props.children === 'Iniciar cola').props.onClick();
assert.equal(saved.length, 4);
assert.ok(qualityFlags.every(value => value === true), 'Credit preparation preserves original quality');
assert.ok(saved.every(item => item.highQuality === true), 'Credit quality flag survives queue publication');
assert.ok(queue().every(item => item.status === 'done'));
console.log('PASS: multiple selection, deduplication, sequential processing, double start, append while running, failure isolation, retry, metadata and memory release.');
