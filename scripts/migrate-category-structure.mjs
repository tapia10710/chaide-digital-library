import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { getFirebaseCliAccessToken } from './firebase-cli-auth.mjs';

const applyChanges = process.argv.includes('--apply');
const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
const databaseRoot = `projects/${projectId}/databases/${databaseId}`;
const documentsRoot = `https://firestore.googleapis.com/v1/${databaseRoot}/documents`;
const token = await getFirebaseCliAccessToken();

const desiredCategories = [
  {
    id: 'catalogo-de-productos',
    name: 'Catálogo de Productos',
    slug: 'catalogo-de-productos',
    description: 'Catálogos de productos de Chaide.',
    icon: 'Crown',
    order: 10,
    sourceMatch: (name) => name.includes('producto'),
  },
  {
    id: 'catalogo-de-distribuidores',
    name: 'Catálogo de Distribuidores',
    slug: 'catalogo-de-distribuidores',
    description: 'Catálogos preparados para distribuidores de Chaide.',
    icon: 'Home',
    order: 20,
    sourceMatch: (name) => name.includes('distribuidor'),
  },
  {
    id: 'fichas-de-productos-e-innovaciones',
    name: 'Fichas de productos e innovaciones',
    slug: 'fichas-de-productos-e-innovaciones',
    description: 'Fichas técnicas, productos e innovaciones de Chaide.',
    icon: 'Cloud',
    order: 30,
    sourceMatch: (name) => name.includes('fichas de producto'),
  },
];
const fallbackName = desiredCategories[2].name;

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function stringField(document, field) {
  return String(document.fields?.[field]?.stringValue || '');
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response;
}

async function listCollection(collectionId) {
  const documents = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '300' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await request(`${documentsRoot}/${collectionId}?${query}`);
    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = String(payload.nextPageToken || '');
  } while (pageToken);
  return documents;
}

async function readState() {
  const [categories, documents] = await Promise.all([
    listCollection('categories'),
    listCollection('documents'),
  ]);
  return { categories, documents };
}

const before = await readState();
const now = new Date().toISOString();
const desiredIds = new Set(desiredCategories.map((category) => category.id));
const writes = [];

for (const desired of desiredCategories) {
  const source = before.categories.find((category) =>
    desired.sourceMatch(normalize(stringField(category, 'name'))));
  const fields = {
    ...(source?.fields || {}),
    id: { stringValue: desired.id },
    name: { stringValue: desired.name },
    slug: { stringValue: desired.slug },
    description: source?.fields?.description || { stringValue: desired.description },
    icon: source?.fields?.icon || { stringValue: desired.icon },
    imageUrl: source?.fields?.imageUrl || { stringValue: '' },
    order: { integerValue: String(desired.order) },
    active: { booleanValue: true },
    updatedAt: { timestampValue: now },
    ...(source?.fields?.createdAt ? {} : { createdAt: { timestampValue: now } }),
  };
  writes.push({
    update: {
      name: `${databaseRoot}/documents/categories/${desired.id}`,
      fields,
    },
  });
}

for (const document of before.documents) {
  writes.push({
    update: {
      name: document.name,
      fields: { category: { stringValue: fallbackName } },
    },
    updateMask: { fieldPaths: ['category'] },
  });
}

for (const category of before.categories) {
  const id = String(category.name || '').split('/').pop();
  if (!desiredIds.has(id)) writes.push({ delete: category.name });
}

console.log(JSON.stringify({
  applyChanges,
  previousCategories: before.categories.map((category) => stringField(category, 'name')),
  documentsToReassign: before.documents.length,
  writes: writes.length,
}, null, 2));

if (!applyChanges) process.exit(0);
if (writes.length > 450) throw new Error(`La migración requiere ${writes.length} escrituras; divídela en lotes.`);
await request(`https://firestore.googleapis.com/v1/${databaseRoot}/documents:commit`, {
  method: 'POST',
  body: JSON.stringify({ writes }),
});

const after = await readState();
const finalCategories = after.categories
  .map((category) => ({
    name: stringField(category, 'name'),
    slug: stringField(category, 'slug'),
    order: Number(category.fields?.order?.integerValue || 0),
  }))
  .sort((left, right) => left.order - right.order);
const misplacedDocuments = after.documents.filter((document) =>
  stringField(document, 'category') !== fallbackName);
const expectedNames = desiredCategories.map((category) => category.name);

if (JSON.stringify(finalCategories.map((category) => category.name)) !== JSON.stringify(expectedNames)) {
  throw new Error(`Categorías finales inesperadas: ${JSON.stringify(finalCategories)}`);
}
if (misplacedDocuments.length) {
  throw new Error(`${misplacedDocuments.length} documentos no quedaron en “${fallbackName}”.`);
}

console.log(JSON.stringify({
  migrated: true,
  categories: finalCategories,
  documentsAssignedToFallback: after.documents.length,
  fallbackName,
}, null, 2));

