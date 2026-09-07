import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { getFirebaseCliAccessToken } from './firebase-cli-auth.mjs';

const [documentId, outputPath] = process.argv.slice(2);
const password = process.env.E2E_ADMIN_PASSWORD;
const adminEmail = process.env.VITE_FIREBASE_ADMIN_EMAIL;
const driveUrl = process.env.VITE_CATALOGOS_DRIVE_URL;
if (!documentId || !outputPath || !password || !adminEmail || !driveUrl) {
  throw new Error('Faltan documento, salida o credenciales administrativas.');
}

const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
const accessToken = await getFirebaseCliAccessToken();
const documentUrl =
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}` +
  `/documents/documents/${encodeURIComponent(documentId)}`;
const documentResponse = await fetch(documentUrl, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'x-goog-user-project': projectId,
  },
});
if (!documentResponse.ok) throw new Error(`No se pudo leer ${documentId}.`);
const document = await documentResponse.json();
const fileId = String(document.fields?.driveFileId?.stringValue || '');
if (!fileId) throw new Error('El catálogo no tiene respaldo de Drive.');

const app = initializeApp(firebaseConfig, `download-${Date.now()}`);
const auth = getAuth(app);
const credential = await signInWithEmailAndPassword(auth, adminEmail, password);
const firebaseToken = await credential.user.getIdToken();

async function drive(action, payload = {}) {
  const response = await fetch(driveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, firebaseToken, ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Drive respondió ${response.status}.`);
  }
  return result;
}

try {
  const info = await drive('downloadInfo', { fileId });
  const chunks = new Array(info.chunkCount);
  let cursor = 0;
  async function worker() {
    while (cursor < info.chunkCount) {
      const index = cursor++;
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const result = await drive('downloadChunk', {
            fileId,
            index,
            total: info.size,
            sessionToken: info.sessionToken,
            sessionExpires: info.sessionExpires,
          });
          if (typeof result.base64 !== 'string' || !result.base64) {
            throw new Error(`Drive devolvió vacío el bloque ${index + 1}.`);
          }
          chunks[index] = Buffer.from(result.base64, 'base64');
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
      if (lastError) throw lastError;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, info.chunkCount) }, () => worker()));
  // Defensive second pass: Apps Script can occasionally finish a concurrent
  // response without delivering one requested block even though the others
  // succeeded. Retrieve only the missing blocks sequentially.
  for (let index = 0; index < info.chunkCount; index += 1) {
    if (chunks[index]) continue;
    const result = await drive('downloadChunk', {
      fileId,
      index,
      total: info.size,
      sessionToken: info.sessionToken,
      sessionExpires: info.sessionExpires,
    });
    if (typeof result.base64 !== 'string' || !result.base64) {
      throw new Error(`Drive no entregó el bloque ${index + 1}/${info.chunkCount}.`);
    }
    chunks[index] = Buffer.from(result.base64, 'base64');
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== info.size || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('La descarga no superó la verificación de integridad.');
  }
  await writeFile(outputPath, bytes);
  console.log(JSON.stringify({ documentId, fileId, bytes: bytes.length, outputPath }));
} finally {
  await signOut(auth).catch(() => undefined);
  await deleteApp(app);
}
