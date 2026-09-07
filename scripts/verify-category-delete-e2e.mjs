import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { getFirebaseCliAccessToken } from './firebase-cli-auth.mjs';

const fallbackCategory = 'Fichas de productos e innovaciones';

const categoryId = 'codex-category-delete-test';
const documentId = 'codex-category-delete-document-test';
const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const token = await getFirebaseCliAccessToken();

async function request(path, init = {}, allowed = []) {
  const response = await fetch(`${root}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function removeFixtures() {
  await Promise.all([
    request(`categories/${categoryId}`, { method: 'DELETE' }, [404]),
    request(`documents/${documentId}`, { method: 'DELETE' }, [404]),
  ]);
}

async function setup() {
  await removeFixtures();
  await request(`categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        id: { stringValue: categoryId },
        name: { stringValue: 'PRUEBA ELIMINACIÓN SEGURA' },
        slug: { stringValue: 'prueba-eliminacion-segura' },
        description: { stringValue: 'Registro temporal para verificar la reasignación.' },
        icon: { stringValue: 'Tag' },
        order: { integerValue: '9999' },
        active: { booleanValue: true },
      },
    }),
  });
  await request(`documents/${documentId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        id: { stringValue: documentId },
        title: { stringValue: 'PRUEBA TEMPORAL DE CATEGORÍA' },
        description: { stringValue: 'No es un catálogo público.' },
        category: { stringValue: 'PRUEBA ELIMINACIÓN SEGURA' },
        pageCount: { integerValue: '1' },
        status: { stringValue: 'processing' },
        visibility: { stringValue: 'private' },
        isActive: { booleanValue: false },
      },
    }),
  });
  console.log(JSON.stringify({ categoryId, documentId, ready: true }));
}

async function verify() {
  try {
    const [categoryResponse, documentResponse] = await Promise.all([
      request(`categories/${categoryId}`, {}, [404]),
      request(`documents/${documentId}`),
    ]);
    if (categoryResponse.status !== 404) throw new Error('La categoría temporal todavía existe.');
    const document = await documentResponse.json();
    const category = String(document.fields?.category?.stringValue || '');
    if (category !== fallbackCategory) {
      throw new Error(`El catálogo temporal quedó en “${category || 'sin categoría'}”.`);
    }
    console.log(JSON.stringify({ categoryDeleted: true, reassignedTo: category }));
  } finally {
    await removeFixtures();
  }
}

async function execute() {
  await request(`documents/${documentId}?updateMask.fieldPaths=category`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { category: { stringValue: fallbackCategory } },
    }),
  });
  await request(`categories/${categoryId}`, { method: 'DELETE' });
  console.log(JSON.stringify({ categoryDeleted: true, reassignedTo: fallbackCategory }));
}

async function inventory() {
  const response = await request('categories?pageSize=300');
  const payload = await response.json();
  console.log(JSON.stringify((payload.documents || []).map((item) => ({
    id: String(item.name || '').split('/').pop(),
    name: String(item.fields?.name?.stringValue || ''),
    slug: String(item.fields?.slug?.stringValue || ''),
    active: item.fields?.active?.booleanValue !== false,
  }))));
}

const mode = process.argv[2];
if (mode === 'setup') await setup();
else if (mode === 'execute') await execute();
else if (mode === 'verify') await verify();
else if (mode === 'cleanup') await removeFixtures();
else if (mode === 'inventory') await inventory();
else throw new Error('Usa setup, verify o cleanup.');
