import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { DocumentDef } from './mockData';
import { del as deleteCachedValue, get as getCachedValue, set as setCachedValue } from 'idb-keyval';

export const FIREBASE_ADMIN_EMAIL =
  (import.meta.env.VITE_FIREBASE_ADMIN_EMAIL || 'catalogoschaide+chaide2026@gmail.com')
    .trim()
    .toLowerCase();
export const FIREBASE_ADMIN_USERNAME =
  (import.meta.env.VITE_FIREBASE_ADMIN_USERNAME || 'Chaide2026').trim();

type CategoryLike = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  order?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type BannerLike = {
  imageUrl: string;
  mobileImageUrl?: string;
  mobileIsActive?: boolean;
  altText: string;
  targetUrl?: string;
  isActive: boolean;
  updatedAt?: string;
};

function withoutUndefined<T extends object>(value: T): T {
  const sanitize = (fieldValue: unknown): unknown => {
    if (fieldValue === undefined) return undefined;
    if (Array.isArray(fieldValue)) {
      return fieldValue
        .map(sanitize)
        .filter((item) => item !== undefined);
    }
    if (
      fieldValue !== null &&
      typeof fieldValue === 'object' &&
      Object.getPrototypeOf(fieldValue) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.entries(fieldValue)
          .map(([key, item]) => [key, sanitize(item)] as const)
          .filter(([, item]) => item !== undefined),
      );
    }
    return fieldValue;
  };
  return sanitize(value) as T;
}

function normalizeSnapshot<T>(
  snapshot: { id: string; data: () => Record<string, unknown> },
): T & { id: string } {
  const value = snapshot.data();
  return {
    ...value,
    id: snapshot.id,
    createdAt: (value.createdAt as { toDate?: () => Date })?.toDate?.().toISOString?.() || value.createdAt,
    updatedAt: (value.updatedAt as { toDate?: () => Date })?.toDate?.().toISOString?.() || value.updatedAt,
  } as unknown as T & { id: string };
}

function extractManagedDriveFileId(url?: string) {
  const value = String(url || '');
  const match = value.match(/drive\.google\.com\/(?:thumbnail\?id=|uc\?[^#]*\bid=|file\/d\/)([A-Za-z0-9_-]+)/i);
  return match?.[1] || '';
}

export function isFirebaseAdminEmail(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === FIREBASE_ADMIN_EMAIL);
}

async function recordAdminAudit(action: string, targetId: string, details: Record<string, unknown> = {}) {
  const user = auth.currentUser;
  if (!user || !isFirebaseAdminEmail(user.email)) return;
  try {
    await setDoc(doc(db, 'auditLogs', crypto.randomUUID()), withoutUndefined({
      action,
      targetId,
      details,
      actorUid: user.uid,
      actorEmail: user.email,
      createdAt: serverTimestamp(),
    }));
  } catch (error) {
    console.warn('[Audit] No se pudo registrar la acción administrativa.', error);
  }
}

export async function fetchFirebaseDocuments(isAdmin = false): Promise<DocumentDef[]> {
  const snapshot = await getDocs(collection(db, 'documents'));
  return snapshot.docs
    .map((item) => normalizeSnapshot<DocumentDef>(item))
    .filter((item) => isAdmin || (
      item.status === 'ready' &&
      item.isActive !== false &&
      item.visibility !== 'private'
    ));
}

export async function fetchFirebaseDocument(
  id: string,
  isAdmin = false,
): Promise<DocumentDef | null> {
  const snapshot = await getDoc(doc(db, 'documents', id));
  if (!snapshot.exists()) return null;
  const item = normalizeSnapshot<DocumentDef>(snapshot);
  if (!isAdmin && (
    item.status !== 'ready' ||
    item.isActive === false ||
    item.visibility === 'private'
  )) return null;
  return item;
}

export async function saveFirebaseDocument(id: string, value: Partial<DocumentDef>) {
  const target = doc(db, 'documents', id);
  const exists = (await getDoc(target)).exists();
  await setDoc(target, withoutUndefined({
    ...value,
    id,
    updatedAt: serverTimestamp(),
    ...(exists ? {} : { createdAt: serverTimestamp() }),
  }), { merge: true });
  await recordAdminAudit(exists ? 'document.update' : 'document.create', id, {
    fields: Object.keys(value),
  });
}

export async function deleteFirebaseDocument(id: string) {
  const documentSnapshot = await getDoc(doc(db, 'documents', id));
  const driveFileIds = documentSnapshot.exists()
    ? [
      String(documentSnapshot.data().driveFileId || ''),
      String(documentSnapshot.data().coverFileId || ''),
    ].filter(Boolean)
    : [];
  // Apps Script/Drive operations are intentionally sequential. Running two
  // authenticated mutations concurrently can be throttled and used to leave
  // an orphaned cover while Firestore was already removed.
  for (const fileId of driveFileIds) {
    await deleteFileFromDrive(fileId);
  }

  const chunks = await getDocs(collection(db, 'pdfFiles', id, 'chunks'));
  const versions = await getDocs(collection(db, 'pdfFiles', id, 'versions'));
  const searchPages = await getDocs(collection(db, 'pdfSearchIndexes', id, 'pages'));
  await Promise.all(chunks.docs.map((item) => deleteDoc(item.ref)));
  await Promise.all(versions.docs.map((item) => deleteDoc(item.ref)));
  await Promise.all(searchPages.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(doc(db, 'pdfFiles', id)).catch(() => undefined);
  await deleteDoc(doc(db, 'pdfSearchIndexes', id)).catch(() => undefined);
  await deleteDoc(doc(db, 'documents', id));
  await recordAdminAudit('document.delete', id, { driveFilesDeleted: driveFileIds.length });
}

export async function fetchFirebaseCategories(): Promise<CategoryLike[]> {
  const snapshot = await getDocs(collection(db, 'categories'));
  return snapshot.docs
    .map((item) => normalizeSnapshot<CategoryLike>(item))
    .filter((item) => item.active !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export async function saveFirebaseCategory(id: string, value: Partial<CategoryLike>) {
  const target = doc(db, 'categories', id);
  const previous = await getDoc(target);
  const exists = previous.exists();
  const previousImageId = extractManagedDriveFileId(String(previous.data()?.imageUrl || ''));
  const nextImageId = extractManagedDriveFileId(value.imageUrl);
  await setDoc(target, withoutUndefined({
    ...value,
    id,
    active: value.active !== false,
    updatedAt: serverTimestamp(),
    ...(exists ? {} : { createdAt: serverTimestamp() }),
  }), { merge: true });
  if (value.imageUrl !== undefined && previousImageId && previousImageId !== nextImageId) {
    await deleteFileFromDrive(previousImageId).catch(() => undefined);
  }
  await recordAdminAudit(exists ? 'category.update' : 'category.create', id);
}

export async function deleteFirebaseCategory(id: string) {
  const previous = await getDoc(doc(db, 'categories', id));
  const imageId = extractManagedDriveFileId(String(previous.data()?.imageUrl || ''));
  if (imageId) await deleteFileFromDrive(imageId);
  await deleteDoc(doc(db, 'categories', id));
  await recordAdminAudit('category.delete', id);
}

export async function fetchFirebaseBanner(): Promise<BannerLike | null> {
  const snapshot = await getDoc(doc(db, 'settings', 'promotional-banner'));
  return snapshot.exists() ? (snapshot.data() as BannerLike) : null;
}

export async function saveFirebaseBanner(value: BannerLike) {
  const target = doc(db, 'settings', 'promotional-banner');
  const previous = await getDoc(target);
  const oldIds = [
    extractManagedDriveFileId(String(previous.data()?.imageUrl || '')),
    extractManagedDriveFileId(String(previous.data()?.mobileImageUrl || '')),
  ].filter(Boolean);
  const newIds = new Set([
    extractManagedDriveFileId(value.imageUrl),
    extractManagedDriveFileId(value.mobileImageUrl),
  ].filter(Boolean));
  await setDoc(target, {
    ...withoutUndefined(value),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  for (const fileId of oldIds) {
    if (!newIds.has(fileId)) await deleteFileFromDrive(fileId).catch(() => undefined);
  }
  await recordAdminAudit('banner.update', 'promotional-banner');
}

export type DriveFileKind = 'catalogs' | 'covers' | 'banners' | 'category-icons';

export type DriveUploadResult = {
  fileId: string;
  driveUrl: string;
  previewUrl: string;
  downloadUrl: string;
  thumbnailUrl: string;
};

export type FirebasePdfUploadResult = {
  url: string;
  version: string;
  chunkCount: number;
};

const PDF_CHUNK_BYTES = 700 * 1024;
const PDF_CACHE_INDEX_KEY = 'chaide_firestore_pdf_cache_v1';

async function cacheFirestorePdf(key: string, bytes: Uint8Array) {
  try {
    const index = (await getCachedValue<Array<{ key: string; usedAt: number }>>(PDF_CACHE_INDEX_KEY)) || [];
    const next = index.filter((entry) => entry.key !== key);
    next.push({ key, usedAt: Date.now() });
    while (next.length > 2) {
      const oldest = next.shift();
      if (oldest) await deleteCachedValue(oldest.key);
    }
    await setCachedValue(key, bytes);
    await setCachedValue(PDF_CACHE_INDEX_KEY, next);
  } catch {
    // IndexedDB can be unavailable in private browsing. The viewer still works
    // with its in-memory object URL in that case.
  }
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export type FirebasePdfSearchPage = {
  pageNumber: number;
  text: string;
};

export async function uploadPdfSearchIndex(
  id: string,
  pages: FirebasePdfSearchPage[],
  version: string,
  onProgress?: (progress: number) => void,
) {
  for (let start = 0; start < pages.length; start += 10) {
    const group = pages.slice(start, start + 10);
    await Promise.all(group.map((page) => setDoc(
      doc(
        db,
        'pdfSearchIndexes',
        id,
        'pages',
        `${version}-${String(page.pageNumber).padStart(5, '0')}`,
      ),
      {
        version,
        pageNumber: page.pageNumber,
        text: page.text,
      },
    )));
    onProgress?.(Math.round((Math.min(start + group.length, pages.length) / Math.max(pages.length, 1)) * 100));
  }

  await setDoc(doc(db, 'pdfSearchIndexes', id), {
    version,
    pageCount: pages.length,
    hasText: pages.some((page) => page.text.trim().length > 0),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return version;
}

export async function fetchFirebasePdfSearchIndex(
  id: string,
  requestedVersion?: string,
  expectedPageCount?: number,
): Promise<FirebasePdfSearchPage[]> {
  const manifest = await getDoc(doc(db, 'pdfSearchIndexes', id));
  if (!manifest.exists()) return [];
  const version = requestedVersion || String(manifest.data().version || '');
  if (!version) return [];

  const snapshot = await getDocs(query(
    collection(db, 'pdfSearchIndexes', id, 'pages'),
    where('version', '==', version),
  ));
  const pages = snapshot.docs
    .map((item) => item.data() as FirebasePdfSearchPage & { version?: string })
    .filter((item) => item.version === version)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(({ pageNumber, text }) => ({ pageNumber, text: String(text || '') }));

  const expected = expectedPageCount || Number(manifest.data().pageCount || 0);
  return pages.length === expected ? pages : [];
}

export async function cleanupPdfSearchIndex(id: string, keepVersion: string) {
  const snapshot = await getDocs(collection(db, 'pdfSearchIndexes', id, 'pages'));
  await Promise.all(
    snapshot.docs
      .filter((item) => item.data().version !== keepVersion)
      .map((item) => deleteDoc(item.ref)),
  );
}

export async function discardPdfSearchIndexVersion(id: string, version: string) {
  const snapshot = await getDocs(collection(db, 'pdfSearchIndexes', id, 'pages'));
  await Promise.all(
    snapshot.docs
      .filter((item) => item.data().version === version)
      .map((item) => deleteDoc(item.ref)),
  );
}

export async function uploadPdfToFirestore(
  id: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<FirebasePdfUploadResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Solo se permiten archivos PDF.');
  }
  if (file.size > 35 * 1024 * 1024) {
    throw new Error('El PDF supera el límite operativo de 35 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const chunkCount = Math.ceil(bytes.length / PDF_CHUNK_BYTES);
  const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  for (let start = 0; start < chunkCount; start += 4) {
    const group = Array.from(
      { length: Math.min(4, chunkCount - start) },
      (_, offset) => start + offset,
    );
    await Promise.all(group.map((index) => {
      const from = index * PDF_CHUNK_BYTES;
      const to = Math.min(from + PDF_CHUNK_BYTES, bytes.length);
      return setDoc(doc(db, 'pdfFiles', id, 'chunks', `${version}-${String(index).padStart(5, '0')}`), {
        index,
        version,
        data: Bytes.fromUint8Array(bytes.slice(from, to)),
      });
    }));
    onProgress?.(Math.round((Math.min(start + group.length, chunkCount) / chunkCount) * 100));
  }

  await setDoc(doc(db, 'pdfFiles', id, 'versions', version), {
    fileName: file.name,
    mimeType: 'application/pdf',
    size: file.size,
    chunkCount,
    version,
    sha256,
    updatedAt: serverTimestamp(),
  });
  return {
    url: `firestore-pdf://${id}?version=${encodeURIComponent(version)}`,
    version,
    chunkCount,
  };
}

export async function finalizePdfVersion(id: string, version: string) {
  const versionRef = doc(db, 'pdfFiles', id, 'versions', version);
  const versionSnapshot = await getDoc(versionRef);
  if (!versionSnapshot.exists()) throw new Error('La versión preparada del PDF no existe.');

  await setDoc(doc(db, 'pdfFiles', id), {
    ...versionSnapshot.data(),
    version,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const [chunks, versions] = await Promise.all([
    getDocs(collection(db, 'pdfFiles', id, 'chunks')),
    getDocs(collection(db, 'pdfFiles', id, 'versions')),
  ]);
  await Promise.all([
    ...chunks.docs
      .filter((item) => item.data().version !== version)
      .map((item) => deleteDoc(item.ref)),
    ...versions.docs
      .filter((item) => item.id !== version)
      .map((item) => deleteDoc(item.ref)),
  ]);
}

export async function discardPdfVersion(id: string, version: string) {
  const chunks = await getDocs(collection(db, 'pdfFiles', id, 'chunks'));
  await Promise.all(
    chunks.docs
      .filter((item) => item.data().version === version)
      .map((item) => deleteDoc(item.ref)),
  );
  await deleteDoc(doc(db, 'pdfFiles', id, 'versions', version)).catch(() => undefined);
}

export async function loadPdfFromFirestore(
  id: string,
  onProgress?: (progress: number) => void,
  requestedVersion?: string,
): Promise<string> {
  onProgress?.(5);
  const manifest = requestedVersion
    ? await getDoc(doc(db, 'pdfFiles', id, 'versions', requestedVersion))
    : await getDoc(doc(db, 'pdfFiles', id));
  if (!manifest.exists()) throw new Error('El PDF no está disponible.');
  onProgress?.(15);
  const version = requestedVersion || String(manifest.data().version || '');
  const cacheKey = `chaide_firestore_pdf_${id}_${version || 'current'}`;
  try {
    const cached = await getCachedValue<Uint8Array>(cacheKey);
    const expectedBytes = Number(manifest.data().size || 0);
    if (cached?.byteLength && (!expectedBytes || cached.byteLength === expectedBytes)) {
      const signature = new TextDecoder('ascii').decode(cached.slice(0, 5));
      if (signature === '%PDF-') {
        onProgress?.(100);
        return URL.createObjectURL(new Blob([cached], { type: 'application/pdf' }));
      }
    }
  } catch {
    // Continue with Firestore when browser storage is unavailable or corrupt.
  }
  const snapshot = version
    ? await getDocs(query(
      collection(db, 'pdfFiles', id, 'chunks'),
      where('version', '==', version),
    ))
    : await getDocs(collection(db, 'pdfFiles', id, 'chunks'));
  onProgress?.(85);
  const ordered = snapshot.docs
    .map((item) => item.data() as { index: number; version?: string; data: Bytes })
    .filter((item) => !version || item.version === version)
    .sort((a, b) => a.index - b.index);
  const expected = Number(manifest.data().chunkCount || 0);
  const hasContiguousChunks = ordered.every((item, index) => item.index === index);
  if (!ordered.length || ordered.length !== expected || !hasContiguousChunks) {
    throw new Error('El PDF está incompleto. Vuelve a publicarlo desde el administrador.');
  }
  const parts = ordered.map((item) => item.data.toUint8Array());
  const totalBytes = parts.reduce((total, part) => total + part.byteLength, 0);
  const expectedBytes = Number(manifest.data().size || 0);
  const signature = new TextDecoder('ascii').decode(parts[0]?.slice(0, 5));
  if ((expectedBytes > 0 && totalBytes !== expectedBytes) || signature !== '%PDF-') {
    throw new Error('El PDF guardado no superó la verificación de integridad. Repáralo desde el administrador.');
  }
  const complete = new Uint8Array(totalBytes);
  let cursor = 0;
  for (const part of parts) {
    complete.set(part, cursor);
    cursor += part.byteLength;
  }
  const expectedHash = String(manifest.data().sha256 || '');
  if (expectedHash && await sha256Hex(complete) !== expectedHash) {
    throw new Error('El PDF no coincide con su firma de integridad. Se intentará usar el respaldo de Drive.');
  }
  await cacheFirestorePdf(cacheKey, complete);
  const blob = new Blob([complete], { type: 'application/pdf' });
  onProgress?.(100);
  return URL.createObjectURL(blob);
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadFileToDrive(
  file: File,
  kind: DriveFileKind,
): Promise<DriveUploadResult> {
  const mimeType = kind === 'catalogs'
    ? 'application/pdf'
    : file.type || 'application/octet-stream';
  const started = await callDriveBridge({
    action: 'uploadInit',
    kind,
    fileName: file.name,
    mimeType,
    size: file.size,
  });
  const chunkSize = Number(started.chunkSize || 1536 * 1024);
  let result: Record<string, any> | null = null;
  for (let from = 0; from < file.size; from += chunkSize) {
    const part = file.slice(from, Math.min(from + chunkSize, file.size));
    result = await callDriveBridge({
      action: 'uploadChunk',
      uploadUrl: started.uploadUrl,
      from,
      total: file.size,
      mimeType,
      base64: await fileToBase64(part),
    });
  }
  if (!result?.complete || !result.fileId) throw new Error('Drive no completó la subida.');
  return result as DriveUploadResult;
}

async function callDriveBridge(payload: Record<string, unknown>) {
  await auth.authStateReady();
  const user = auth.currentUser;
  const bridgeUrl = String(import.meta.env.VITE_CATALOGOS_DRIVE_URL || '').trim();
  if (!user || !isFirebaseAdminEmail(user.email)) {
    throw new Error('La sesión administrativa no es válida.');
  }
  if (!bridgeUrl) throw new Error('El puente de Google Drive no está configurado.');

  const response = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      ...payload,
      firebaseToken: await user.getIdToken(),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Google Drive rechazó la operación.');
  }
  return result;
}

export async function downloadFileFromDrive(fileId: string, fileName = 'catalogo.pdf') {
  const info = await callDriveBridge({ action: 'downloadInfo', fileId });
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let index = 0; index < Number(info.chunkCount || 0); index++) {
    const result = await callDriveBridge({ action: 'downloadChunk', fileId, index });
    const binary = atob(String(result.base64 || ''));
    const part = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset++) {
      part[offset] = binary.charCodeAt(offset);
    }
    parts.push(part);
    total += part.length;
  }
  if (!total || total !== Number(info.size || 0)) {
    throw new Error('El respaldo de Drive está incompleto.');
  }
  return new File(parts, fileName || String(info.fileName || 'catalogo.pdf'), {
    type: String(info.mimeType || 'application/pdf'),
  });
}

export async function loadPublicDrivePdf(downloadUrl: string): Promise<string> {
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(downloadUrl)) {
    throw new Error('El enlace de respaldo no pertenece a Google Drive.');
  }
  const response = await fetch(downloadUrl, { cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error(`Drive respondió ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = new TextDecoder('ascii').decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') throw new Error('Drive no devolvió un PDF válido.');
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

export async function deleteFileFromDrive(fileId: string) {
  if (!fileId) return;
  await callDriveBridge({ action: 'delete', fileId });
}
