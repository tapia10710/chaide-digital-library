import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const password = process.env.E2E_ADMIN_PASSWORD;
const adminEmail = process.env.VITE_FIREBASE_ADMIN_EMAIL;
const driveUrl = process.env.VITE_CATALOGOS_DRIVE_URL;
const skipDrive = process.env.SKIP_DRIVE_E2E === '1';
const pdfPath = process.argv[2];
if (!password || !adminEmail || !driveUrl || !pdfPath) {
  throw new Error(
    'Faltan E2E_ADMIN_PASSWORD, VITE_FIREBASE_ADMIN_EMAIL, VITE_CATALOGOS_DRIVE_URL o la ruta PDF.',
  );
}

const bytes = new Uint8Array(await readFile(resolve(pdfPath)));
const pdf = await pdfjs.getDocument({
  data: new Uint8Array(bytes),
  disableWorker: true,
}).promise;
const pages = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => typeof item?.str === 'string' ? item.str : '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  pages.push({ pageNumber, text });
}
await pdf.destroy();
if (!pages.some((page) => page.text)) throw new Error('El PDF de prueba no tiene texto buscable.');

const app = initializeApp(firebaseConfig, `admin-e2e-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const credential = await signInWithEmailAndPassword(auth, adminEmail, password);
const firebaseToken = await credential.user.getIdToken();
const id = `__admin-upload-e2e-${Date.now().toString(36)}`;
const version = `e2e-${Date.now().toString(36)}`;
const searchVersion = `${version}-${pages.length}`;
const chunkBytes = 700 * 1024;
const chunkCount = Math.ceil(bytes.length / chunkBytes);
let driveFileId = '';

async function drive(action, payload = {}) {
  const response = await fetch(driveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, firebaseToken, ...payload }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `Drive ${action} falló.`);
  return result;
}

async function uploadDriveFile(fileName, value) {
  const started = await drive('uploadInit', {
    kind: 'catalogs',
    fileName,
    mimeType: 'application/pdf',
    size: value.length,
  });
  let result;
  for (let from = 0; from < value.length; from += started.chunkSize) {
    const part = value.slice(from, Math.min(from + started.chunkSize, value.length));
    result = await drive('uploadChunk', {
      uploadUrl: started.uploadUrl,
      from,
      total: value.length,
      mimeType: 'application/pdf',
      base64: Buffer.from(part).toString('base64'),
    });
  }
  if (!result?.complete || !result.fileId) throw new Error('Drive no completó la subida.');
  return result;
}

async function downloadDriveFile(fileId) {
  const info = await drive('downloadInfo', { fileId });
  const parts = [];
  for (let index = 0; index < info.chunkCount; index++) {
    const chunk = await drive('downloadChunk', { fileId, index });
    parts.push(Buffer.from(chunk.base64, 'base64'));
  }
  const value = Buffer.concat(parts);
  if (value.length !== info.size) throw new Error('Drive devolvió una descarga incompleta.');
  return value;
}

try {
  const backup = skipDrive
    ? { fileId: 'verified-separately', downloadUrl: '' }
    : await uploadDriveFile(`__admin-upload-e2e-${basename(pdfPath)}`, bytes);
  driveFileId = skipDrive ? '' : backup.fileId;

  for (const page of pages) {
    await setDoc(
      doc(db, 'pdfSearchIndexes', id, 'pages', `${searchVersion}-${String(page.pageNumber).padStart(5, '0')}`),
      { ...page, version: searchVersion },
    );
  }
  await setDoc(doc(db, 'pdfSearchIndexes', id), {
    version: searchVersion,
    pageCount: pages.length,
    hasText: true,
  });

  for (let index = 0; index < chunkCount; index++) {
    await setDoc(doc(db, 'pdfFiles', id, 'chunks', `${version}-${String(index).padStart(5, '0')}`), {
      index,
      version,
      data: Bytes.fromUint8Array(bytes.slice(index * chunkBytes, (index + 1) * chunkBytes)),
    });
  }
  const manifest = {
    fileName: basename(pdfPath),
    mimeType: 'application/pdf',
    size: bytes.length,
    chunkCount,
    version,
  };
  await setDoc(doc(db, 'pdfFiles', id, 'versions', version), manifest);
  await setDoc(doc(db, 'documents', id), {
    id,
    title: 'Prueba temporal de carga administrativa',
    description: 'Prueba aislada del PDF, respaldo y buscador.',
    category: 'Prueba',
    pageCount: pages.length,
    fileUrl: `firestore-pdf://${id}?version=${version}`,
    externalUrl: backup.downloadUrl,
    driveFileId,
    driveBackupStatus: 'ready',
    storageVersion: version,
    searchIndexVersion: searchVersion,
    searchIndexStatus: 'ready',
    status: 'ready',
    visibility: 'public',
    isActive: true,
  });
  await setDoc(doc(db, 'pdfFiles', id), manifest);

  const publicApp = initializeApp(firebaseConfig, `public-e2e-${Date.now()}`);
  const publicDb = getFirestore(publicApp, firebaseConfig.firestoreDatabaseId);
  const [publicDocument, publicVersion, publicChunks, publicIndex, publicPages] = await Promise.all([
    getDoc(doc(publicDb, 'documents', id)),
    getDoc(doc(publicDb, 'pdfFiles', id, 'versions', version)),
    getDocs(collection(publicDb, 'pdfFiles', id, 'chunks')),
    getDoc(doc(publicDb, 'pdfSearchIndexes', id)),
    getDocs(collection(publicDb, 'pdfSearchIndexes', id, 'pages')),
  ]);
  const restored = Buffer.concat(
    publicChunks.docs
      .map((item) => item.data())
      .filter((item) => item.version === version)
      .sort((a, b) => a.index - b.index)
      .map((item) => Buffer.from(item.data.toUint8Array())),
  );
  const restoredPdf = await pdfjs.getDocument({
    data: new Uint8Array(restored),
    disableWorker: true,
  }).promise;
  const restoredPages = restoredPdf.numPages;
  await restoredPdf.destroy();

  const driveBytes = skipDrive
    ? Buffer.from(bytes)
    : await downloadDriveFile(driveFileId);
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const searchableText = publicPages.docs.map((item) => String(item.data().text || '')).join(' ');
  const searchProbe = pages.flatMap((page) => page.text.split(/\s+/)).find((word) => word.length >= 6) || '';

  const result = {
    authenticatedAdmin: true,
    publicDocument: publicDocument.exists(),
    versionManifest: publicVersion.exists(),
    chunks: publicChunks.size,
    pdfPages: restoredPages,
    indexManifest: publicIndex.exists(),
    indexPages: publicPages.size,
    searchAvailable: Boolean(searchProbe && searchableText.includes(searchProbe)),
    driveBackup: skipDrive ? 'verified-separately' : hash(bytes) === hash(driveBytes),
    downloadValid: hash(bytes) === hash(restored),
  };
  console.log(JSON.stringify(result));
  if (
    !result.publicDocument ||
    !result.versionManifest ||
    result.chunks !== chunkCount ||
    result.pdfPages !== pages.length ||
    !result.indexManifest ||
    result.indexPages !== pages.length ||
    !result.searchAvailable ||
    result.driveBackup === false ||
    !result.downloadValid
  ) {
    process.exitCode = 1;
  }
  await deleteApp(publicApp);
} finally {
  const [chunks, versions, indexPages] = await Promise.all([
    getDocs(collection(db, 'pdfFiles', id, 'chunks')),
    getDocs(collection(db, 'pdfFiles', id, 'versions')),
    getDocs(collection(db, 'pdfSearchIndexes', id, 'pages')),
  ]);
  await Promise.all([
    ...chunks.docs.map((item) => deleteDoc(item.ref)),
    ...versions.docs.map((item) => deleteDoc(item.ref)),
    ...indexPages.docs.map((item) => deleteDoc(item.ref)),
  ]);
  await Promise.all([
    deleteDoc(doc(db, 'pdfFiles', id)).catch(() => undefined),
    deleteDoc(doc(db, 'pdfSearchIndexes', id)).catch(() => undefined),
    deleteDoc(doc(db, 'documents', id)).catch(() => undefined),
  ]);
  if (driveFileId) await drive('delete', { fileId: driveFileId }).catch(() => undefined);
  await signOut(auth);
  await deleteApp(app);
}

process.exit(process.exitCode || 0);
