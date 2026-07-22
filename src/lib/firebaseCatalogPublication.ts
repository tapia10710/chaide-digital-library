import type { DocumentDef } from './mockData';
import type { PreparedPdfCatalog } from './catalogSearchIndex';
import { preparePdfCatalog } from './catalogSearchIndex';
import {
  cleanupPdfSearchIndex,
  deleteFileFromDrive,
  discardPdfSearchIndexVersion,
  discardPdfVersion,
  downloadFileFromDrive,
  finalizePdfVersion,
  saveFirebaseDocument,
  uploadPdfSearchIndex,
  uploadPdfToFirestore,
  uploadFileToDrive,
} from './firebaseCatalog';

type ProgressCallback = (message: string, progress?: number) => void;

export async function publishPreparedFirebasePdf(
  id: string,
  prepared: PreparedPdfCatalog,
  document: Partial<DocumentDef>,
  onProgress?: ProgressCallback,
) {
  const searchIndexVersion =
    `${Date.now().toString(36)}-${prepared.pageCount}-${crypto.randomUUID().slice(0, 6)}`;
  let storageVersion = '';
  let documentSaved = false;

  try {
    onProgress?.('Guardando índice de búsqueda', 0);
    await uploadPdfSearchIndex(id, prepared.pages, searchIndexVersion, (progress) => {
      onProgress?.('Guardando índice de búsqueda', progress);
    });

    onProgress?.('Guardando PDF para el visor integrado', 0);
    const storage = await uploadPdfToFirestore(id, prepared.viewerFile, (progress) => {
      onProgress?.('Guardando PDF para el visor integrado', progress);
    });
    storageVersion = storage.version;

    await saveFirebaseDocument(id, {
      ...document,
      id,
      fileUrl: storage.url,
      fileSize: prepared.viewerFile.size,
      viewerOptimization: prepared.viewerOptimization,
      pageCount: prepared.pageCount,
      storageVersion,
      searchIndexVersion,
      searchIndexStatus: prepared.searchablePages > 0 ? 'ready' : 'no-text',
      status: 'ready',
      isActive: document.isActive !== false,
    });
    documentSaved = true;

    // The versioned URL already works at this point. Finalization only promotes
    // the new version as the legacy fallback and removes stale data.
    const cleanup = await Promise.allSettled([
      finalizePdfVersion(id, storageVersion),
      cleanupPdfSearchIndex(id, searchIndexVersion),
    ]);
    const cleanupPending = cleanup.some((result) => result.status === 'rejected');
    if (cleanupPending) {
      await saveFirebaseDocument(id, { maintenanceStatus: 'cleanup-pending' } as Partial<DocumentDef>);
    } else if (document.maintenanceStatus) {
      await saveFirebaseDocument(id, { maintenanceStatus: 'ready' } as Partial<DocumentDef>);
    }

    return {
      fileUrl: storage.url,
      storageVersion,
      searchIndexVersion,
    };
  } catch (error) {
    if (!documentSaved) {
      await Promise.allSettled([
        storageVersion ? discardPdfVersion(id, storageVersion) : Promise.resolve(),
        discardPdfSearchIndexVersion(id, searchIndexVersion),
      ]);
    }
    throw error;
  }
}

export async function repairFirebaseDocumentFromDrive(
  document: DocumentDef,
  onProgress?: ProgressCallback,
) {
  if (!document.driveFileId) {
    throw new Error('Este catálogo no tiene un respaldo de Drive registrado.');
  }

  onProgress?.('Descargando respaldo de Google Drive', 0);
  const file = await downloadFileFromDrive(
    document.driveFileId,
    `${document.title || document.id}.pdf`,
  );
  onProgress?.('Validando todas las páginas y reconstruyendo el índice', 0);
  const prepared = await preparePdfCatalog(file, (progress) => {
    onProgress?.('Validando todas las páginas y reconstruyendo el índice', progress);
  });
  let newCoverFileId = '';
  try {
    const cover = prepared.generatedCover
      ? await uploadFileToDrive(prepared.generatedCover, 'covers')
      : null;
    newCoverFileId = cover?.fileId || '';
    const publication = await publishPreparedFirebasePdf(
      document.id,
      prepared,
      {
        ...document,
        coverUrl: cover?.thumbnailUrl || cover?.driveUrl || document.coverUrl,
        coverFileId: cover?.fileId || document.coverFileId,
        indexItems: prepared.indexItems,
        viewerOptimization: prepared.viewerOptimization,
        driveBackupStatus: 'ready',
      },
      onProgress,
    );
    if (document.coverFileId && document.coverFileId !== cover?.fileId) {
      await deleteFileFromDrive(document.coverFileId).catch(() => undefined);
    }
    onProgress?.('Catálogo reparado y verificado', 100);
    return publication;
  } catch (error) {
    if (newCoverFileId) await deleteFileFromDrive(newCoverFileId).catch(() => undefined);
    throw error;
  }
}
