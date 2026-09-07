import {
  Bytes,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { DocumentDef } from './mockData';
import { buildCatalogSearchTokens } from './catalogSearchTokens';
import {
  FALLBACK_CATEGORY_ID,
  FALLBACK_CATEGORY_NAME,
  FALLBACK_CATEGORY_SLUG,
  findFallbackCategory,
  isFallbackCategory,
  normalizeCategoryIdentity,
} from './categoryStructure';
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

export type FirebaseCategoryDeletionResult = {
  fallbackCategory: CategoryLike;
  reassignedDocumentIds: string[];
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
  const source = isAdmin
    ? collection(db, 'documents')
    : query(
      collection(db, 'documents'),
      where('status', '==', 'ready'),
      where('isActive', '==', true),
      where('visibility', '==', 'public'),
    );
  const snapshot = await getDocs(source);
  return snapshot.docs
    .map((item) => normalizeSnapshot<DocumentDef>(item))
    .filter((item) => isAdmin || (
      item.status === 'ready' &&
      item.isActive !== false &&
      item.visibility !== 'private'
    ));
}

/**
 * Keeps the catalogue list current in already-open browser tabs. Deletions are
 * hidden by the public query as soon as their visibility/status changes, while
 * replacements arrive with a new searchIndexVersion that invalidates old
 * assistant and search caches.
 */
export async function subscribeFirebaseDocuments(
  isAdmin: boolean,
  onDocuments: (documents: DocumentDef[]) => void,
  onError?: (error: Error) => void,
) {
  await auth.authStateReady();
  const canReadAdmin = isAdmin && isFirebaseAdminEmail(auth.currentUser?.email);
  const source = canReadAdmin
    ? collection(db, 'documents')
    : query(
      collection(db, 'documents'),
      where('status', '==', 'ready'),
      where('isActive', '==', true),
      where('visibility', '==', 'public'),
    );

  return onSnapshot(source, (snapshot) => {
    const documents = snapshot.docs
      .map((item) => normalizeSnapshot<DocumentDef>(item))
      .filter((item) => canReadAdmin || (
        item.status === 'ready' &&
        item.isActive !== false &&
        item.visibility !== 'private'
      ));
    onDocuments(documents);
  }, (error) => onError?.(error));
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
  const currentSnapshot = await getDoc(target);
  const exists = currentSnapshot.exists();
  const current = currentSnapshot.data() || {};
  const currentPubliclySearchable =
    exists &&
    current.status === 'ready' &&
    current.isActive !== false &&
    current.visibility !== 'private';
  const publiclySearchable =
    (value.status ?? current.status) === 'ready' &&
    (value.isActive ?? current.isActive) !== false &&
    (value.visibility ?? current.visibility) !== 'private';
  const searchVersionChanged = Boolean(
    value.searchIndexVersion && value.searchIndexVersion !== current.searchIndexVersion,
  );
  const searchVisibilityChanged = currentPubliclySearchable !== publiclySearchable;
  const needsSearchPromotion = publiclySearchable &&
    (!exists || searchVisibilityChanged || searchVersionChanged);

  // Hide search pages before making a catalogue private. Publishing works in
  // the opposite order: metadata first, pages second, so draft text is never
  // exposed before the catalogue itself is public.
  const hidesPreviouslyPublicSearch = exists && searchVisibilityChanged && !publiclySearchable;
  if (hidesPreviouslyPublicSearch) {
    await syncGlobalSearchVisibility(id, false);
  }
  try {
    await setDoc(target, withoutUndefined({
      ...value,
      id,
      updatedAt: serverTimestamp(),
      ...(exists ? {} : { createdAt: serverTimestamp() }),
      ...(needsSearchPromotion ? { searchVisibilityStatus: 'pending' } : {}),
      ...(searchVisibilityChanged && !publiclySearchable
        ? { searchVisibilityStatus: deleteField() }
        : {}),
    }), { merge: true });
  } catch (error) {
    if (hidesPreviouslyPublicSearch) {
      try {
        await syncGlobalSearchVisibility(id, true);
      } catch {
        await setDoc(doc(db, 'maintenanceTasks', `search-visibility-${id}`), {
          type: 'search-visibility',
          documentId: id,
          isPublic: true,
          status: 'pending',
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
    }
    throw error;
  }
  await recordAdminAudit(exists ? 'document.update' : 'document.create', id, {
    fields: Object.keys(value),
  });
  if (needsSearchPromotion) {
    try {
      await syncGlobalSearchVisibility(id, true);
      await setDoc(target, {
        searchVisibilityStatus: deleteField(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await deleteDoc(doc(db, 'maintenanceTasks', `search-visibility-${id}`)).catch(() => undefined);
    } catch (error) {
      // The document and PDF are already valid. Keep them published, leave the
      // search pages private, and persist a safe retry instead of making the
      // publication rollback a version that is already referenced.
      await setDoc(doc(db, 'maintenanceTasks', `search-visibility-${id}`), {
        type: 'search-visibility',
        documentId: id,
        isPublic: true,
        status: 'pending',
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
      console.warn('[Search] La visibilidad del índice se reintentará durante el mantenimiento.', error);
    }
  }
}

async function syncGlobalSearchVisibility(id: string, publiclySearchable: boolean) {
  const snapshot = await getDocs(query(
    collection(db, 'catalogSearchPages'),
    where('catalogId', '==', id),
  ));
  for (let start = 0; start < snapshot.docs.length; start += 10) {
    await Promise.all(snapshot.docs.slice(start, start + 10).map((page) =>
      setDoc(page.ref, { isPublic: publiclySearchable }, { merge: true })));
  }
}

export async function deleteFirebaseDocument(id: string) {
  const documentSnapshot = await getDoc(doc(db, 'documents', id));
  const driveFileIds = documentSnapshot.exists()
    ? [
      String(documentSnapshot.data().driveFileId || ''),
      String(documentSnapshot.data().coverFileId || ''),
    ].filter(Boolean)
    : [];
  if (documentSnapshot.exists()) {
    // Hide the catalogue first. If a later cleanup step is interrupted, no
    // partially deleted PDF or draft metadata remains visible to visitors.
    await setDoc(doc(db, 'documents', id), {
      visibility: 'private',
      isActive: false,
      status: 'processing',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await syncGlobalSearchVisibility(id, false);
  }

  const chunks = await getDocs(collection(db, 'pdfFiles', id, 'chunks'));
  const versions = await getDocs(collection(db, 'pdfFiles', id, 'versions'));
  const searchPages = await getDocs(collection(db, 'pdfSearchIndexes', id, 'pages'));
  const globalSearchPages = await getDocs(query(
    collection(db, 'catalogSearchPages'),
    where('catalogId', '==', id),
  ));
  await deleteDocumentRefsInGroups(chunks.docs.map((item) => item.ref));
  await deleteDocumentRefsInGroups(versions.docs.map((item) => item.ref));
  await deleteDocumentRefsInGroups(searchPages.docs.map((item) => item.ref));
  await deleteDocumentRefsInGroups(globalSearchPages.docs.map((item) => item.ref));
  await deleteDoc(doc(db, 'pdfFiles', id)).catch(() => undefined);
  await deleteDoc(doc(db, 'pdfSearchIndexes', id)).catch(() => undefined);

  const deletionTaskId = `drive-delete-${id}`;
  if (driveFileIds.length) {
    // Register the external cleanup before removing the last Firestore record.
    // If this write fails, the hidden document remains available for retry.
    await setDoc(doc(db, 'maintenanceTasks', deletionTaskId), {
      type: 'drive-delete',
      documentId: id,
      fileIds: driveFileIds,
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
  }
  await deleteDoc(doc(db, 'documents', id));
  const cleanup = await deleteDriveFilesReliably(id, driveFileIds, deletionTaskId);
  await recordAdminAudit('document.delete', id, {
    driveFilesDeleted: cleanup.deleted,
    driveFilesPending: cleanup.pending.length,
  });
}

export async function deleteDriveFilesReliably(
  documentId: string,
  fileIds: string[],
  taskId = `drive-cleanup-${documentId}-${Date.now().toString(36)}`,
) {
  const uniqueFileIds = Array.from(new Set(fileIds.map(String).filter(Boolean)));
  if (!uniqueFileIds.length) return { deleted: 0, pending: [] as string[] };

  const taskRef = doc(db, 'maintenanceTasks', taskId);
  // Persist the intent before contacting Drive. Closing the tab or losing the
  // network after publication must never make the old backup impossible to
  // clean up later.
  await setDoc(taskRef, {
    type: 'drive-delete',
    documentId,
    fileIds: uniqueFileIds,
    status: 'pending',
    updatedAt: serverTimestamp(),
  });

  const pending: string[] = [];
  for (const fileId of uniqueFileIds) {
    try {
      await deleteFileFromDrive(fileId);
    } catch {
      pending.push(fileId);
    }
  }

  if (pending.length) {
    await setDoc(taskRef, {
      fileIds: pending,
      status: 'pending',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } else {
    await deleteDoc(taskRef);
  }
  return { deleted: uniqueFileIds.length - pending.length, pending };
}

async function deleteDocumentRefsInGroups(refs: Array<{ path: string }>) {
  for (let start = 0; start < refs.length; start += 10) {
    await Promise.all(refs.slice(start, start + 10).map((reference) =>
      deleteDoc(doc(db, reference.path))));
  }
}

export async function runFirebaseMaintenance() {
  const summary = {
    driveFilesDeleted: 0,
    driveFilesPending: 0,
    searchVisibilityPending: 0,
    catalogCleanupsCompleted: 0,
    orphanManifestsDeleted: 0,
  };

  const tasks = await getDocs(collection(db, 'maintenanceTasks'));
  for (const task of tasks.docs) {
    const data = task.data();
    if (data.type === 'search-visibility') {
      try {
        const documentId = String(data.documentId || '');
        const target = doc(db, 'documents', documentId);
        const targetSnapshot = await getDoc(target);
        if (targetSnapshot.exists()) {
          await syncGlobalSearchVisibility(documentId, data.isPublic === true);
          await setDoc(target, {
            searchVisibilityStatus: deleteField(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
        await deleteDoc(task.ref);
        summary.catalogCleanupsCompleted += 1;
      } catch {
        summary.searchVisibilityPending += 1;
      }
      continue;
    }
    if (data.type !== 'drive-delete') continue;
    const pending: string[] = [];
    for (const fileId of Array.isArray(data.fileIds) ? data.fileIds.map(String) : []) {
      try {
        await deleteFileFromDrive(fileId);
        summary.driveFilesDeleted += 1;
      } catch {
        pending.push(fileId);
      }
    }
    if (pending.length) {
      summary.driveFilesPending += pending.length;
      await setDoc(task.ref, {
        fileIds: pending,
        status: 'pending',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } else {
      await deleteDoc(task.ref);
    }
  }

  const documents = await getDocs(collection(db, 'documents'));
  for (const item of documents.docs) {
    const data = item.data();
    if (data.searchVisibilityStatus === 'pending') {
      try {
        await syncGlobalSearchVisibility(item.id, true);
        await setDoc(item.ref, {
          searchVisibilityStatus: deleteField(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await deleteDoc(doc(db, 'maintenanceTasks', `search-visibility-${item.id}`)).catch(() => undefined);
        summary.catalogCleanupsCompleted += 1;
      } catch {
        // Keep the pending marker for the next safe maintenance attempt.
      }
    }
    if (data.maintenanceStatus !== 'cleanup-pending') continue;
    const storageVersion = String(data.storageVersion || '');
    const searchVersion = String(data.searchIndexVersion || '');
    const results = await Promise.allSettled([
      storageVersion ? finalizePdfVersion(item.id, storageVersion) : Promise.resolve(),
      searchVersion ? cleanupPdfSearchIndex(item.id, searchVersion) : Promise.resolve(),
    ]);
    if (results.every((result) => result.status === 'fulfilled')) {
      await setDoc(item.ref, {
        maintenanceStatus: deleteField(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      summary.catalogCleanupsCompleted += 1;
    }
  }

  const documentIds = new Set(documents.docs.map((item) => item.id));
  const [pdfManifests, searchManifests, globalSearchPages] = await Promise.all([
    getDocs(collection(db, 'pdfFiles')),
    getDocs(collection(db, 'pdfSearchIndexes')),
    getDocs(collection(db, 'catalogSearchPages')),
  ]);
  for (const manifest of pdfManifests.docs) {
    if (documentIds.has(manifest.id)) continue;
    const [orphanChunks, orphanVersions] = await Promise.all([
      getDocs(collection(db, 'pdfFiles', manifest.id, 'chunks')),
      getDocs(collection(db, 'pdfFiles', manifest.id, 'versions')),
    ]);
    await deleteDocumentRefsInGroups(orphanChunks.docs.map((item) => item.ref));
    await deleteDocumentRefsInGroups(orphanVersions.docs.map((item) => item.ref));
    await deleteDoc(manifest.ref);
    summary.orphanManifestsDeleted += 1;
  }
  for (const manifest of searchManifests.docs) {
    if (documentIds.has(manifest.id)) continue;
    const orphanPages = await getDocs(collection(db, 'pdfSearchIndexes', manifest.id, 'pages'));
    await deleteDocumentRefsInGroups(orphanPages.docs.map((item) => item.ref));
    await deleteDoc(manifest.ref);
    summary.orphanManifestsDeleted += 1;
  }
  const orphanGlobalPages = globalSearchPages.docs.filter(
    (page) => !documentIds.has(String(page.data().catalogId || '')),
  );
  await deleteDocumentRefsInGroups(orphanGlobalPages.map((page) => page.ref));
  summary.orphanManifestsDeleted += orphanGlobalPages.length;

  if (Object.values(summary).some((value) => value > 0)) {
    await recordAdminAudit('maintenance.run', 'firebase', summary);
  }
  return summary;
}

export async function fetchFirebaseCategories(isAdmin = false): Promise<CategoryLike[]> {
  const snapshot = await getDocs(collection(db, 'categories'));
  return snapshot.docs
    .map((item) => normalizeSnapshot<CategoryLike>(item))
    .filter((item) => isAdmin || item.active !== false)
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

export async function deleteFirebaseCategory(id: string): Promise<FirebaseCategoryDeletionResult> {
  const categoryRef = doc(db, 'categories', id);
  const [previous, categorySnapshot, documentSnapshot] = await Promise.all([
    getDoc(categoryRef),
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'documents')),
  ]);
  if (!previous.exists()) throw new Error('La categoría ya no existe.');

  const category = normalizeSnapshot<CategoryLike>(previous);
  const normalizedCategoryReferences = new Set([
    normalizeCategoryIdentity(category.id),
    normalizeCategoryIdentity(category.name),
    normalizeCategoryIdentity(category.slug),
  ].filter(Boolean));
  if (isFallbackCategory(category)) {
    throw new Error(`“${FALLBACK_CATEGORY_NAME}” es la categoría de respaldo y no se puede eliminar.`);
  }

  const existingFallback = findFallbackCategory(
    categorySnapshot.docs.map((item) => normalizeSnapshot<CategoryLike>(item)),
  );
  const fallbackCategory: CategoryLike = existingFallback || {
    id: FALLBACK_CATEGORY_ID,
    name: FALLBACK_CATEGORY_NAME,
    slug: FALLBACK_CATEGORY_SLUG,
    description: 'Fichas técnicas, productos e innovaciones de Chaide.',
    icon: 'Cloud',
    imageUrl: '',
    order: 0,
    active: true,
  };
  if (!existingFallback) {
    await saveFirebaseCategory(fallbackCategory.id, fallbackCategory);
  } else if (existingFallback.active === false) {
    await saveFirebaseCategory(existingFallback.id, { active: true });
    fallbackCategory.active = true;
  }

  const affectedDocuments = documentSnapshot.docs.filter((item) =>
    normalizedCategoryReferences.has(normalizeCategoryIdentity(item.data().category)));
  const groups = affectedDocuments.length
    ? Array.from({ length: Math.ceil(affectedDocuments.length / 400) }, (_, index) =>
      affectedDocuments.slice(index * 400, (index + 1) * 400))
    : [[]];

  for (let index = 0; index < groups.length; index += 1) {
    const batch = writeBatch(db);
    for (const item of groups[index]) {
      batch.set(item.ref, {
        category: fallbackCategory.name,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    if (index === groups.length - 1) batch.delete(categoryRef);
    await batch.commit();
  }

  const imageId = extractManagedDriveFileId(String(category.imageUrl || ''));
  if (imageId) await deleteFileFromDrive(imageId).catch(() => undefined);
  await recordAdminAudit('category.delete', id, {
    previousName: category.name,
    fallbackCategory: fallbackCategory.name,
    reassignedDocuments: affectedDocuments.length,
  });
  return {
    fallbackCategory,
    reassignedDocumentIds: affectedDocuments.map((item) => item.id),
  };
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
  md5Checksum?: string;
};

export type DriveCatalogFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  driveUrl: string;
  previewUrl: string;
  downloadUrl: string;
  md5Checksum?: string;
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

export type FirebaseGlobalSearchPage = FirebasePdfSearchPage & {
  catalogId: string;
  version: string;
};

export async function uploadPdfSearchIndex(
  id: string,
  pages: FirebasePdfSearchPage[],
  version: string,
  onProgress?: (progress: number) => void,
) {
  try {
    for (let start = 0; start < pages.length; start += 10) {
      const group = pages.slice(start, start + 10);
      await Promise.all(group.flatMap((page) => {
        const pageSuffix = String(page.pageNumber).padStart(5, '0');
        const pageData = {
          catalogId: id,
          version,
          pageNumber: page.pageNumber,
          text: page.text,
          tokens: buildCatalogSearchTokens(page.text),
          // Publication metadata is committed only after both the PDF and its
          // index exist. saveFirebaseDocument promotes these pages afterwards.
          isPublic: false,
        };
        return [
          setDoc(
            doc(db, 'pdfSearchIndexes', id, 'pages', `${version}-${pageSuffix}`),
            {
              version,
              pageNumber: page.pageNumber,
              text: page.text,
            },
          ),
          setDoc(doc(db, 'catalogSearchPages', `${id}__${version}__${pageSuffix}`), pageData),
        ];
      }));
      onProgress?.(Math.round((Math.min(start + group.length, pages.length) / Math.max(pages.length, 1)) * 100));
    }

    await setDoc(doc(db, 'pdfSearchIndexes', id), {
      version,
      pageCount: pages.length,
      hasText: pages.some((page) => page.text.trim().length > 0),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return version;
  } catch (error) {
    await discardPdfSearchIndexVersion(id, version).catch(() => undefined);
    throw error;
  }
}

/** One indexed query replaces loading every catalogue index in a fresh browser. */
export async function searchFirebaseCatalogPages(
  queryTokens: string[],
  maximumResults = 750,
): Promise<FirebaseGlobalSearchPage[]> {
  const tokens = Array.from(new Set(queryTokens.flatMap(buildCatalogSearchTokens))).slice(0, 10);
  if (!tokens.length) return [];
  const [metadata, snapshot] = await Promise.all([
    getDoc(doc(db, 'catalogSearchMeta', 'current')),
    getDocs(query(
      collection(db, 'catalogSearchPages'),
      where('tokens', 'array-contains-any', tokens),
      where('isPublic', '==', true),
      limit(Math.max(1, Math.min(maximumResults, 750))),
    )),
  ]);
  if (!metadata.exists() || metadata.data().ready !== true) {
    throw new Error('El índice global todavía no está preparado.');
  }
  return snapshot.docs.map((item) => {
    const value = item.data();
    return {
      catalogId: String(value.catalogId || ''),
      version: String(value.version || ''),
      pageNumber: Number(value.pageNumber || 0),
      text: String(value.text || ''),
    };
  }).filter((page) => page.catalogId && page.pageNumber > 0);
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
  const [snapshot, globalSnapshot] = await Promise.all([
    getDocs(collection(db, 'pdfSearchIndexes', id, 'pages')),
    getDocs(query(collection(db, 'catalogSearchPages'), where('catalogId', '==', id))),
  ]);
  await deleteDocumentRefsInGroups(
    [...snapshot.docs, ...globalSnapshot.docs]
      .filter((item) => item.data().version !== keepVersion)
      .map((item) => item.ref),
  );
}

export async function discardPdfSearchIndexVersion(id: string, version: string) {
  const [snapshot, globalSnapshot] = await Promise.all([
    getDocs(collection(db, 'pdfSearchIndexes', id, 'pages')),
    getDocs(query(collection(db, 'catalogSearchPages'), where('catalogId', '==', id))),
  ]);
  await deleteDocumentRefsInGroups(
    [...snapshot.docs, ...globalSnapshot.docs]
      .filter((item) => item.data().version === version)
      .map((item) => item.ref),
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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const chunkCount = Math.ceil(bytes.length / PDF_CHUNK_BYTES);
  const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Upload several independent Firestore chunks together. Eight concurrent
    // writes reduces round trips without creating an excessive request burst.
    for (let start = 0; start < chunkCount; start += 8) {
      const group = Array.from(
        { length: Math.min(8, chunkCount - start) },
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
  } catch (error) {
    await discardPdfVersion(id, version).catch(() => undefined);
    throw error;
  }
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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 45_000,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function uploadFileToDrive(
  file: File,
  kind: DriveFileKind,
  onProgress?: (progress: number) => void,
): Promise<DriveUploadResult> {
  const mimeType = kind === 'catalogs'
    ? 'application/pdf'
    : file.type || 'application/octet-stream';
  const uploadKey = crypto.randomUUID();
  const started = await callDriveBridge({
    action: 'uploadInit',
    kind,
    fileName: file.name,
    mimeType,
    size: file.size,
    uploadKey,
  });
  const chunkSize = Number(started.chunkSize || 1536 * 1024);
  let result: Record<string, any> | null = null;
  let from = 0;
  let recoveries = 0;
  let stalledResponses = 0;
  onProgress?.(0);
  while (from < file.size) {
    const part = file.slice(from, Math.min(from + chunkSize, file.size));
    try {
      result = await callDriveBridge({
        action: 'uploadChunk',
        uploadUrl: started.uploadUrl,
        from,
        total: file.size,
        mimeType,
        base64: await fileToBase64(part),
        sessionToken: started.sessionToken,
        sessionExpires: started.sessionExpires,
      });
      recoveries = 0;
    } catch (chunkError) {
      if (recoveries >= 4) throw chunkError;
      recoveries += 1;
      result = await callDriveBridge({
        action: 'uploadStatus',
        uploadUrl: started.uploadUrl,
        uploadKey: started.uploadKey || uploadKey,
        total: file.size,
        mimeType,
        sessionToken: started.sessionToken,
        sessionExpires: started.sessionExpires,
      });
    }
    if (result?.complete && result.fileId) return result as DriveUploadResult;
    const nextOffset = Number(result?.nextOffset);
    if (!Number.isInteger(nextOffset) || nextOffset < 0 || nextOffset > file.size) {
      throw new Error('Drive devolvió un avance de subida inválido.');
    }
    if (nextOffset === from && part.size > 0) {
      // The status endpoint can legitimately report zero before Drive accepts
      // the first block. Permit a few resends without allowing an infinite
      // loop when a resumable session stops advancing.
      stalledResponses += 1;
      if (stalledResponses > 5) {
        throw new Error('La subida a Drive dejó de avanzar. Vuelve a intentarlo; el archivo temporal se limpiará automáticamente.');
      }
      continue;
    }
    stalledResponses = 0;
    from = nextOffset;
    onProgress?.(Math.round((Math.min(from, file.size) / file.size) * 100));
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

  const body = JSON.stringify({
    ...payload,
    firebaseToken: await user.getIdToken(),
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      }, 45_000);
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
      }
      continue;
    }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok) return result;
    const errorMessage = String(result?.error || '');
    const retryableMessage = /temporar|timeout|tiempo de espera|rate limit|demasiadas solicitudes|service invoked too many times|internal error|try again/i.test(errorMessage);
    const retryable = (
      (!result && (
        response.status === 404 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      )) ||
      Boolean(result && retryableMessage)
    );
    if (!retryable) {
      throw new Error(result?.error || 'Google Drive rechazó la operación.');
    }
    lastError = new Error(`Google Drive respondió ${response.status}.`);
    if (attempt < 4) {
      await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Google Drive no respondió después de varios intentos.');
}

export async function listDriveCatalogFiles(): Promise<DriveCatalogFile[]> {
  const result = await callDriveBridge({ action: 'listCatalogs' });
  if (!Array.isArray(result.files)) throw new Error('Google Drive no devolvió la lista de PDFs.');
  return result.files
    .map((item: Record<string, unknown>) => ({
      fileId: String(item.fileId || ''),
      fileName: String(item.fileName || 'catalogo.pdf'),
      mimeType: String(item.mimeType || 'application/pdf'),
      size: Number(item.size || 0),
      createdAt: String(item.createdAt || ''),
      updatedAt: String(item.updatedAt || ''),
      driveUrl: String(item.driveUrl || ''),
      previewUrl: String(item.previewUrl || ''),
      downloadUrl: String(item.downloadUrl || ''),
      md5Checksum: String(item.md5Checksum || ''),
    }))
    .filter((item: DriveCatalogFile) => Boolean(item.fileId));
}

export async function downloadFileFromDrive(
  fileId: string,
  fileName = 'catalogo.pdf',
  onProgress?: (progress: number) => void,
) {
  const info = await callDriveBridge({ action: 'downloadInfo', fileId });
  const parts: Uint8Array[] = [];
  let total = 0;
  const chunkCount = Number(info.chunkCount || 0);
  for (let start = 0; start < chunkCount; start += 4) {
    const indexes = Array.from(
      { length: Math.min(4, chunkCount - start) },
      (_, offset) => start + offset,
    );
    const results = await Promise.all(indexes.map((index) =>
      callDriveBridge({
        action: 'downloadChunk',
        fileId,
        index,
        total: Number(info.size || 0),
        sessionToken: info.sessionToken,
        sessionExpires: info.sessionExpires,
      })));
    results.forEach((result, offset) => {
      const binary = atob(String(result.base64 || ''));
      const part = new Uint8Array(binary.length);
      for (let byte = 0; byte < binary.length; byte++) part[byte] = binary.charCodeAt(byte);
      parts[indexes[offset]] = part;
      total += part.length;
    });
    onProgress?.(Math.round((Math.min(start + indexes.length, chunkCount) / Math.max(chunkCount, 1)) * 100));
  }
  if (!total || total !== Number(info.size || 0)) {
    throw new Error('El respaldo de Drive está incompleto.');
  }
  const signature = new TextDecoder('ascii').decode(parts[0]?.slice(0, 5));
  if (signature !== '%PDF-') {
    throw new Error('El respaldo de Drive no contiene un PDF válido.');
  }
  return new File(parts, fileName || String(info.fileName || 'catalogo.pdf'), {
    type: String(info.mimeType || 'application/pdf'),
  });
}

export async function loadPublicDrivePdf(downloadUrl: string): Promise<string> {
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(downloadUrl)) {
    throw new Error('El enlace de respaldo no pertenece a Google Drive.');
  }
  const response = await fetchWithTimeout(
    downloadUrl,
    { cache: 'no-store', redirect: 'follow' },
    60_000,
  );
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
