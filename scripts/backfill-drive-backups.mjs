import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteField, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const password = process.env.E2E_ADMIN_PASSWORD;
const adminEmail = process.env.VITE_FIREBASE_ADMIN_EMAIL;
const driveUrl = process.env.VITE_CATALOGOS_DRIVE_URL;
if (!password || !adminEmail || !driveUrl) {
  throw new Error('Faltan las variables administrativas requeridas.');
}

const database = JSON.parse(await readFile(new URL('../data/db.json', import.meta.url), 'utf8'));
const documents = database.documents.filter((item) => {
  const url = String(item.fileUrl || '');
  return url.startsWith('/storage/pdfs/') || /^https?:\/\/.+\.pdf(?:[?#].*)?$/i.test(url);
});
const app = initializeApp(firebaseConfig, `drive-backfill-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const credential = await signInWithEmailAndPassword(auth, adminEmail, password);
const firebaseToken = await credential.user.getIdToken();

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

async function downloadDriveFile(fileId) {
  const info = await drive('downloadInfo', { fileId });
  const parts = [];
  for (let index = 0; index < info.chunkCount; index++) {
    const chunk = await drive('downloadChunk', { fileId, index });
    parts.push(Buffer.from(chunk.base64, 'base64'));
  }
  const value = Buffer.concat(parts);
  if (value.length !== info.size) throw new Error('La descarga de Drive quedó incompleta.');
  return value;
}

async function uploadDriveFile(fileName, bytes) {
  const started = await drive('uploadInit', {
    kind: 'catalogs',
    fileName,
    mimeType: 'application/pdf',
    size: bytes.length,
  });
  let result;
  for (let from = 0; from < bytes.length; from += started.chunkSize) {
    const part = bytes.slice(from, Math.min(from + started.chunkSize, bytes.length));
    result = await drive('uploadChunk', {
      uploadUrl: started.uploadUrl,
      from,
      total: bytes.length,
      mimeType: 'application/pdf',
      base64: Buffer.from(part).toString('base64'),
    });
  }
  if (!result?.complete || !result.fileId) throw new Error('Drive no completó la subida.');
  return result;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
let created = 0;
let skipped = 0;

try {
  for (let index = 0; index < documents.length; index++) {
    const item = documents[index];
    const target = doc(db, 'documents', item.id);
    const snapshot = await getDoc(target);
    if (
      snapshot.exists() &&
      snapshot.data().driveFileId &&
      snapshot.data().driveBackupStatus === 'ready'
    ) {
      skipped++;
      console.log(`[${index + 1}/${documents.length}] ${item.title}: respaldo existente`);
      continue;
    }

    const isLocal = String(item.fileUrl).startsWith('/storage/pdfs/');
    const fileName = isLocal
      ? basename(item.fileUrl)
      : basename(new URL(item.fileUrl).pathname) || `${item.id}.pdf`;
    const bytes = isLocal
      ? new Uint8Array(await readFile(join(
        new URL('../data/uploads/pdfs/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
        fileName,
      )))
      : new Uint8Array(await (await fetch(item.fileUrl)).arrayBuffer());
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableWorker: true,
    }).promise;
    if (pdf.numPages !== Number(item.pageCount)) {
      throw new Error(
        `${item.title}: esperaba ${item.pageCount} páginas y encontró ${pdf.numPages}.`,
      );
    }
    await pdf.destroy();

    let uploaded = snapshot.exists() && snapshot.data().driveFileId
      ? {
        fileId: snapshot.data().driveFileId,
        downloadUrl: snapshot.data().externalUrl || '',
      }
      : null;
    try {
      if (!uploaded) {
        uploaded = await uploadDriveFile(fileName, bytes);
        await setDoc(target, {
          driveFileId: uploaded.fileId,
          externalUrl: uploaded.downloadUrl,
          driveBackupStatus: 'pending-verification',
        }, { merge: true });
      }
      const restored = await downloadDriveFile(uploaded.fileId);
      if (restored.length !== bytes.length || hash(restored) !== hash(bytes)) {
        throw new Error(`${item.title}: el respaldo descargado no coincide con el original.`);
      }
      await setDoc(target, {
        driveFileId: uploaded.fileId,
        externalUrl: uploaded.downloadUrl,
        driveBackupStatus: 'ready',
      }, { merge: true });
      created++;
      console.log(
        `[${index + 1}/${documents.length}] ${item.title}: ${pdf.numPages} páginas, respaldo verificado`,
      );
    } catch (error) {
      if (uploaded?.fileId) await drive('delete', { fileId: uploaded.fileId }).catch(() => undefined);
      await setDoc(target, {
        driveFileId: deleteField(),
        externalUrl: deleteField(),
        driveBackupStatus: 'error',
      }, { merge: true }).catch(() => undefined);
      throw error;
    }
  }
  console.log(JSON.stringify({ documents: documents.length, created, skipped, verified: true }));
} finally {
  await signOut(auth);
  await deleteApp(app);
}

process.exit(0);
