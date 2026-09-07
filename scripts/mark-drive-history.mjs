import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { getFirebaseCliAccessToken } from './firebase-cli-auth.mjs';

const [documentId, driveFileId] = process.argv.slice(2);
if (!documentId || !driveFileId) {
  throw new Error('Uso: node scripts/mark-drive-history.mjs DOCUMENT_ID DRIVE_FILE_ID');
}

const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
const documentUrl =
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}` +
  `/documents/documents/${encodeURIComponent(documentId)}`;
const accessToken = await getFirebaseCliAccessToken();
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': projectId,
};

const currentResponse = await fetch(documentUrl, { headers });
if (!currentResponse.ok) {
  throw new Error(`No se pudo leer ${documentId}: ${currentResponse.status} ${await currentResponse.text()}`);
}
const current = await currentResponse.json();
const existing = (current.fields?.driveHistoricalFileIds?.arrayValue?.values || [])
  .map((value) => String(value.stringValue || ''))
  .filter(Boolean);
const values = Array.from(new Set([...existing, driveFileId]));

const patchUrl = new URL(documentUrl);
patchUrl.searchParams.append('updateMask.fieldPaths', 'driveHistoricalFileIds');
const response = await fetch(patchUrl, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    fields: {
      driveHistoricalFileIds: {
        arrayValue: { values: values.map((value) => ({ stringValue: value })) },
      },
    },
  }),
});
if (!response.ok) {
  throw new Error(`No se pudo actualizar ${documentId}: ${response.status} ${await response.text()}`);
}
console.log(JSON.stringify({ documentId, driveHistoricalFileIds: values }));
