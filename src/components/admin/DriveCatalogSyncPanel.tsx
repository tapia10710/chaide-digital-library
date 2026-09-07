import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  FileText,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { preparePdfCatalog } from '../../lib/catalogSearchIndex';
import {
  deleteDriveFilesReliably,
  deleteFileFromDrive,
  downloadFileFromDrive,
  listDriveCatalogFiles,
  uploadFileToDrive,
  type DriveCatalogFile,
} from '../../lib/firebaseCatalog';
import { publishPreparedFirebasePdf } from '../../lib/firebaseCatalogPublication';
import type { DocumentDef } from '../../lib/mockData';
import { useStore } from '../../store/useStore';
import { FALLBACK_CATEGORY_NAME, findFallbackCategory } from '../../lib/categoryStructure';

type ImportMode = 'new' | 'replace';

interface FilePlan {
  selected: boolean;
  mode: ImportMode;
  category: string;
  replaceTargetId: string;
}

const SAVED_PLANS_KEY = 'chaide_drive_sync_plans_v1';

function loadSavedPlans(): Record<string, FilePlan> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PLANS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => {
      const plan = value as Partial<FilePlan>;
      return typeof plan.selected === 'boolean' &&
        (plan.mode === 'new' || plan.mode === 'replace') &&
        typeof plan.category === 'string' &&
        typeof plan.replaceTargetId === 'string';
    })) as Record<string, FilePlan>;
  } catch {
    return {};
  }
}

function readableSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamaño desconocido';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function suggestedTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalized(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function catalogIdentity(value: string) {
  const ignored = new Set([
    'catalogo', 'catalogos', 'digital', 'chaide', 'de', 'del', 'la', 'el',
    'compressed', 'comprimido', 'final', 'version', 'nuevo', 'copia',
  ]);
  return normalized(value)
    .replace(/\.pdf$/i, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((word) => !ignored.has(word) && !/^\d+$/.test(word))
    .map((word) => {
      if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2);
      if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
      return word;
    })
    .sort()
    .join(' ');
}

function inferCategory(fileName: string, categoryNames: string[]) {
  const source = normalized(fileName);
  const categoryRules = [
    { words: ['almohada'], match: 'almohada' },
    { words: ['espuma'], match: 'espuma' },
    { words: ['hotel'], match: 'hotel' },
    {
      words: [
        'complemento', 'sabana', 'cobija', 'duvet', 'edredon', 'cobertor',
        'toalla', 'protector', 'cojin', 'masajeador', 'massager', 'massage mat',
        'antifaz', 'home&travel seat',
      ],
      match: 'complemento',
    },
    { words: ['tempur', 'colchon'], match: 'colchon' },
    { words: ['mueble', 'base', 'cabecera', 'velador', 'sofa cama', 'foam box'], match: 'mueble' },
  ];
  for (const rule of categoryRules) {
    if (!rule.words.some((word) => source.includes(word))) continue;
    const category = categoryNames.find((name) => normalized(name).includes(rule.match));
    if (category) return category;
  }
  return findFallbackCategory(categoryNames.map((name) => ({ name })))?.name ||
    categoryNames.find((name) => normalized(name).includes('ficha')) ||
    FALLBACK_CATEGORY_NAME;
}

function suggestedTags(title: string) {
  const ignored = new Set(['catalogo', 'digital', 'chaide', 'para', 'con', 'del', 'las', 'los']);
  return Array.from(new Set(
    normalized(title)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !ignored.has(word)),
  )).slice(0, 8);
}

function matchingDocument(file: DriveCatalogFile, documents: DocumentDef[]) {
  if (file.md5Checksum) {
    const exactCopy = documents.find((document) => (
      document.driveMd5Checksum && document.driveMd5Checksum === file.md5Checksum
    ));
    if (exactCopy) return exactCopy;
  }
  const identity = catalogIdentity(file.fileName);
  if (!identity) return undefined;
  return documents.find((document) => catalogIdentity(document.title) === identity);
}

function defaultPlan(file: DriveCatalogFile, documents: DocumentDef[], categoryNames: string[]): FilePlan {
  const duplicate = matchingDocument(file, documents);
  return {
    selected: false,
    mode: duplicate ? 'replace' : 'new',
    category: duplicate?.category || inferCategory(file.fileName, categoryNames),
    replaceTargetId: duplicate?.id || '',
  };
}

export default function DriveCatalogSyncPanel() {
  const { categories, documents, addDocument, fetchDocuments } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [files, setFiles] = useState<DriveCatalogFile[]>([]);
  const [plans, setPlans] = useState<Record<string, FilePlan>>(loadSavedPlans);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busyFileId, setBusyFileId] = useState('');
  const [message, setMessage] = useState('');
  const [publishNow, setPublishNow] = useState(true);

  const categoryNames = useMemo(
    () => categories.filter((item) => item.active !== false).map((item) => item.name),
    [categories],
  );
  const linkedDriveIds = useMemo(
    () => new Set(documents.flatMap((document) => [
      document.driveFileId,
      ...(document.driveHistoricalFileIds || []),
    ]).filter(Boolean)),
    [documents],
  );
  const identityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    files.forEach((file) => {
      const identity = catalogIdentity(file.fileName);
      if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
    });
    return counts;
  }, [files]);
  const checksumCounts = useMemo(() => {
    const counts = new Map<string, number>();
    files.forEach((file) => {
      if (file.md5Checksum) counts.set(file.md5Checksum, (counts.get(file.md5Checksum) || 0) + 1);
    });
    return counts;
  }, [files]);
  const actionableFiles = useMemo(
    () => files.filter((file) => !linkedDriveIds.has(file.fileId)),
    [files, linkedDriveIds],
  );
  const selectableFiles = actionableFiles;
  const selectedFiles = useMemo(
    () => selectableFiles.filter((file) => plans[file.fileId]?.selected),
    [plans, selectableFiles],
  );
  const allSelected = selectableFiles.length > 0 && selectedFiles.length === selectableFiles.length;

  useEffect(() => {
    if (!isBatchProcessing && !busyFileId) return undefined;
    const preventAccidentalExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [isBatchProcessing, busyFileId]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
    } catch {
      // The panel still works when browser storage is unavailable.
    }
  }, [plans]);

  const refreshFiles = async () => {
    setIsLoading(true);
    setLoadError('');
    setMessage('Revisando la carpeta de Google Drive…');
    try {
      const available = await listDriveCatalogFiles();
      setFiles(available);
      setPlans((current) => {
        const next: Record<string, FilePlan> = {};
        available.forEach((file) => {
          const fallback = defaultPlan(file, documents, categoryNames);
          const saved = current[file.fileId];
          const validTarget = saved?.mode !== 'replace' || documents.some((doc) => doc.id === saved.replaceTargetId);
          next[file.fileId] = saved && validTarget
            ? {
                ...saved,
                category: categoryNames.includes(saved.category) ? saved.category : fallback.category,
              }
            : fallback;
        });
        return next;
      });
      const availableToImport = available.filter((file) => !linkedDriveIds.has(file.fileId)).length;
      setMessage(
        availableToImport
          ? `${availableToImport} PDF${availableToImport === 1 ? '' : 's'} disponible${availableToImport === 1 ? '' : 's'} para decidir.`
          : 'Todos los PDFs de Drive ya están vinculados a la biblioteca.',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudo revisar Google Drive.';
      setLoadError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const openPanel = () => {
    setIsOpen(true);
    setDeleteConfirmation('');
    setPublishNow(true);
    void refreshFiles();
  };

  const updatePlan = (file: DriveCatalogFile, patch: Partial<FilePlan>) => {
    if (isBatchProcessing || linkedDriveIds.has(file.fileId)) return;
    setPlans((current) => ({
      ...current,
      [file.fileId]: {
        ...(current[file.fileId] || defaultPlan(file, documents, categoryNames)),
        ...patch,
      },
    }));
    setDeleteConfirmation('');
  };

  const changeMode = (file: DriveCatalogFile, mode: ImportMode) => {
    const duplicate = matchingDocument(file, documents);
    const fallbackTarget = duplicate || documents.find((document) => document.status !== 'processing');
    updatePlan(file, {
      mode,
      replaceTargetId: mode === 'replace' ? (duplicate?.id || fallbackTarget?.id || '') : '',
      category: mode === 'replace'
        ? (duplicate?.category || fallbackTarget?.category || plans[file.fileId]?.category || '')
        : (plans[file.fileId]?.category || inferCategory(file.fileName, categoryNames)),
    });
  };

  const changeReplaceTarget = (file: DriveCatalogFile, targetId: string) => {
    const target = documents.find((document) => document.id === targetId);
    updatePlan(file, {
      replaceTargetId: targetId,
      category: target?.category || plans[file.fileId]?.category || '',
    });
  };

  const toggleAll = () => {
    if (isBatchProcessing) return;
    setPlans((current) => {
      const next = { ...current };
      selectableFiles.forEach((file) => {
        next[file.fileId] = {
          ...(next[file.fileId] || defaultPlan(file, documents, categoryNames)),
          selected: !allSelected,
        };
      });
      return next;
    });
    setDeleteConfirmation('');
  };

  const removeDriveFile = async (file: DriveCatalogFile) => {
    if (deleteConfirmation !== file.fileId) {
      setDeleteConfirmation(file.fileId);
      setMessage(`Confirma la eliminación definitiva de “${file.fileName}” en la carpeta compartida.`);
      return;
    }
    setBusyFileId(file.fileId);
    try {
      await deleteFileFromDrive(file.fileId);
      const verifiedFiles = await listDriveCatalogFiles();
      if (verifiedFiles.some((item) => item.fileId === file.fileId)) {
        throw new Error('Drive confirmó la solicitud, pero el archivo todavía aparece en la carpeta. Inténtalo nuevamente.');
      }
      setFiles(verifiedFiles);
      setPlans((current) => {
        const next = { ...current };
        delete next[file.fileId];
        return next;
      });
      setDeleteConfirmation('');
      setMessage('PDF eliminado y verificado: ya no existe en la carpeta compartida de Google Drive.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el PDF de Google Drive.');
    } finally {
      setBusyFileId('');
    }
  };

  const processSelected = async () => {
    const queue = selectedFiles.map((file) => ({ file, plan: plans[file.fileId] }));
    if (queue.length === 0 || isBatchProcessing) {
      setMessage('Selecciona al menos un PDF para agregarlo a la web.');
      return;
    }
    const invalid = queue.find(({ plan }) => (
      !plan?.category || (plan.mode === 'replace' && !documents.some((doc) => doc.id === plan.replaceTargetId))
    ));
    if (invalid) {
      setMessage(`Completa la categoría y la operación de “${invalid.file.fileName}”.`);
      return;
    }
    const replacementTargets = queue
      .filter(({ plan }) => plan.mode === 'replace')
      .map(({ plan }) => plan.replaceTargetId);
    const repeatedTarget = replacementTargets.find(
      (targetId, index) => replacementTargets.indexOf(targetId) !== index,
    );
    if (repeatedTarget) {
      const target = documents.find((document) => document.id === repeatedTarget);
      setMessage(`Dos PDFs no pueden reemplazar “${target?.title || 'el mismo catálogo'}” en un solo lote.`);
      return;
    }

    setIsBatchProcessing(true);
    setDeleteConfirmation('');
    const completedIds: string[] = [];
    const failures: string[] = [];
    const warnings: string[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const { file, plan } = queue[index];
      const target = plan.mode === 'replace'
        ? documents.find((document) => document.id === plan.replaceTargetId)
        : undefined;
      const position = `${index + 1}/${queue.length}`;
      const generatedTitle = suggestedTitle(file.fileName);
      const title = target?.title || generatedTitle;
      let newCoverFileId = '';
      let publicationCommitted = false;
      setBusyFileId(file.fileId);
      try {
        setMessage(`${position} · Descargando “${file.fileName}”…`);
        const pdf = await downloadFileFromDrive(file.fileId, file.fileName, (progress) => {
          setMessage(`${position} · Descargando “${file.fileName}”… ${progress}%`);
        });
        const prepared = await preparePdfCatalog(pdf, (progress) => {
          setMessage(`${position} · Preparando visor e índice… ${progress}%`);
        });
        const cover = prepared.generatedCover
          ? await uploadFileToDrive(prepared.generatedCover, 'covers')
          : null;
        newCoverFileId = cover?.fileId || '';
        const id = target?.id || `doc-${Date.now().toString(36)}-${index}`;
        const value = {
          ...(target || {}),
          id,
          title,
          description: target?.description || `Catálogo digital ${generatedTitle}.`,
          category: plan.category,
          pageCount: prepared.pageCount,
          coverUrl: cover?.thumbnailUrl || cover?.driveUrl || target?.coverUrl || '',
          coverFileId: cover?.fileId || target?.coverFileId || '',
          externalUrl: file.downloadUrl,
          driveFileId: file.fileId,
          driveMd5Checksum: file.md5Checksum || '',
          driveHistoricalFileIds: target
            ? Array.from(new Set([
                ...(target.driveHistoricalFileIds || []),
                target.driveFileId || '',
              ].filter(Boolean)))
            : [],
          driveBackupStatus: 'ready' as const,
          fileSize: prepared.viewerFile.size,
          viewerOptimization: prepared.viewerOptimization,
          tags: target?.tags?.length ? target.tags : suggestedTags(generatedTitle),
          sourceType: 'url' as const,
          visibility: publishNow ? 'public' : 'private',
          isActive: publishNow,
          priority: target?.priority ?? 5,
          indexItems: prepared.indexItems,
        };
        const publication = await publishPreparedFirebasePdf(id, prepared, value, (stage, progress) => {
          setMessage(`${position} · ${stage}${progress === undefined ? '' : `… ${progress}%`}`);
        });
        publicationCommitted = true;
        if (!target) {
          addDocument({
            ...value,
            ...publication,
            status: 'ready',
            searchIndexStatus: prepared.searchablePages > 0 ? 'ready' : 'no-text',
          });
        }
        const obsoleteDriveIds = target
          ? [
              target.driveFileId && target.driveFileId !== file.fileId
                ? target.driveFileId
                : '',
              cover?.fileId && target.coverFileId && target.coverFileId !== cover.fileId
                ? target.coverFileId
                : '',
            ].filter(Boolean) as string[]
          : [];
        if (obsoleteDriveIds.length) {
          const cleanup = await deleteDriveFilesReliably(target!.id, obsoleteDriveIds);
          if (cleanup.pending.length) {
            warnings.push(`La limpieza anterior de ${title} se reintentará automáticamente.`);
          }
        }
        completedIds.push(file.fileId);
      } catch (error) {
        if (!publicationCommitted && newCoverFileId) {
          await deleteFileFromDrive(newCoverFileId).catch(() => undefined);
        }
        failures.push(`${file.fileName}: ${error instanceof Error ? error.message : 'error desconocido'}`);
      }
    }

    setBusyFileId('');
    await fetchDocuments(true).catch(() => undefined);
    setFiles((current) => current.filter((file) => !completedIds.includes(file.fileId)));
    setPlans((current) => {
      const next = { ...current };
      completedIds.forEach((id) => delete next[id]);
      return next;
    });
    setIsBatchProcessing(false);
    if (failures.length === 0) {
      setMessage(`${completedIds.length} PDF${completedIds.length === 1 ? '' : 's'} procesado${completedIds.length === 1 ? '' : 's'} correctamente.${warnings.length ? ` ${warnings[0]}` : ''}`);
    } else {
      setMessage(`${completedIds.length} completados · ${failures.length} con error. ${failures[0]}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-blue-500 active:scale-[0.97]"
      >
        <CloudDownload className="h-4 w-4" />
        Sincronizar Drive
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-sync-title"
        >
          <section className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#111827]/95 text-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
              <div>
                <h2 id="drive-sync-title" className="text-xl font-bold">Decidir PDFs de Google Drive</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Configura cada archivo como nuevo o reemplazo. Tus decisiones se conservan hasta procesar la lista.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refreshFiles()}
                  disabled={isLoading || isBatchProcessing || Boolean(busyFileId)}
                  aria-label="Volver a revisar Google Drive"
                  className="rounded-xl border border-white/10 p-2.5 text-gray-300 transition-[background-color,transform] duration-150 hover:bg-white/10 active:scale-[0.97] disabled:opacity-40"
                >
                  <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isBatchProcessing || Boolean(busyFileId)}
                  aria-label="Cerrar sincronización con Drive"
                  className="rounded-xl border border-white/10 p-2.5 text-gray-300 transition-[background-color,transform] duration-150 hover:bg-white/10 active:scale-[0.97] disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {isLoading && files.length === 0 ? (
                <div className="grid min-h-56 place-items-center text-sm text-gray-400">
                  <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Revisando Drive…</span>
                </div>
              ) : loadError ? (
                <div className="grid min-h-56 place-items-center px-6 text-center">
                  <div><AlertCircle className="mx-auto h-9 w-9 text-amber-300" /><p className="mt-3 font-semibold">Drive no respondió correctamente</p></div>
                </div>
              ) : actionableFiles.length === 0 ? (
                <div className="grid min-h-56 place-items-center px-6 text-center">
                  <div><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" /><p className="mt-3 font-semibold">No hay PDFs nuevos por decidir</p><p className="mt-1 text-sm text-gray-400">Los catálogos que ya están en la web permanecen ocultos aquí.</p></div>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={isBatchProcessing || selectableFiles.length === 0}
                        className="h-5 w-5 rounded border-white/20 accent-blue-600"
                      />
                      Seleccionar todos los disponibles
                    </label>
                    <span className="text-xs text-gray-300">{selectedFiles.length} seleccionados · {actionableFiles.length} disponibles</span>
                  </div>

                  <div className="space-y-3">
                    {actionableFiles.map((file) => {
                      const plan = plans[file.fileId] || defaultPlan(file, documents, categoryNames);
                      const duplicateDocument = matchingDocument(file, documents);
                      const exactPublishedCopy = Boolean(file.md5Checksum && documents.some(
                        (document) => document.driveMd5Checksum === file.md5Checksum,
                      ));
                      const exactDriveCopy = Boolean(
                        file.md5Checksum && (checksumCounts.get(file.md5Checksum) || 0) > 1,
                      );
                      const sameCatalogName = Boolean(duplicateDocument) ||
                        (identityCounts.get(catalogIdentity(file.fileName)) || 0) > 1;
                      const repeated = exactPublishedCopy || exactDriveCopy || sameCatalogName;
                      const isBusy = busyFileId === file.fileId;
                      return (
                        <article
                          key={file.fileId}
                          className={`rounded-2xl border p-4 transition-colors duration-150 ${plan.selected ? 'border-blue-400/70 bg-blue-500/10' : 'border-white/10 bg-black/20'}`}
                        >
                          <div className="grid gap-4 xl:grid-cols-[minmax(230px,1.25fr)_minmax(170px,.7fr)_minmax(180px,.8fr)_minmax(220px,1fr)_auto] xl:items-center">
                            <div className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={plan.selected}
                                onChange={() => updatePlan(file, { selected: !plan.selected })}
                                disabled={isBatchProcessing}
                                aria-label={`Seleccionar ${file.fileName}`}
                                className="mt-3 h-5 w-5 shrink-0 rounded accent-blue-600 disabled:opacity-35"
                              />
                              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-300"><FileText className="h-5 w-5" /></div>
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold" title={file.fileName}>{file.fileName}</h3>
                                <p className="mt-1 text-xs text-gray-400">{readableSize(file.size)}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {repeated && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">
                                    {exactPublishedCopy || exactDriveCopy ? 'Copia idéntica' : 'Posible reemplazo'}
                                  </span>}
                                  {!repeated && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-bold uppercase text-blue-300">Nuevo</span>}
                                  {isBusy && <span className="rounded-full bg-blue-500 px-2 py-1 text-[10px] font-bold uppercase">Procesando</span>}
                                </div>
                              </div>
                            </div>

                            <label className="block text-xs text-gray-400">
                              Operación
                              <select
                                value={plan.mode}
                                onChange={(event) => changeMode(file, event.target.value as ImportMode)}
                                disabled={isBatchProcessing}
                                aria-label={`Operación para ${file.fileName}`}
                                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-40"
                              >
                                <option value="new">Crear catálogo nuevo</option>
                                <option value="replace">Reemplazar existente</option>
                              </select>
                            </label>

                            <label className="block text-xs text-gray-400">
                              Categoría
                              <select
                                value={plan.category}
                                onChange={(event) => updatePlan(file, { category: event.target.value })}
                                disabled={isBatchProcessing}
                                aria-label={`Categoría para ${file.fileName}`}
                                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-40"
                              >
                                <option value="">Elegir categoría</option>
                                {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
                              </select>
                            </label>

                            {plan.mode === 'replace' ? (
                              <label className="block text-xs text-gray-400">
                                Catálogo que se reemplazará
                                <select
                                  value={plan.replaceTargetId}
                                  onChange={(event) => changeReplaceTarget(file, event.target.value)}
                                  disabled={isBatchProcessing}
                                  aria-label={`Catálogo que reemplazará ${file.fileName}`}
                                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-40"
                                >
                                  <option value="">Elegir catálogo</option>
                                  {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
                                </select>
                              </label>
                            ) : (
                              <div className="flex min-h-[66px] items-end text-xs text-gray-500">
                                Se creará un catálogo nuevo
                              </div>
                            )}

                            <div className="flex justify-end gap-1">
                              <a href={file.driveUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${file.fileName} en Google Drive`} className="rounded-lg p-2.5 text-gray-400 hover:bg-white/10 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
                              <button
                                type="button"
                                onClick={() => void removeDriveFile(file)}
                                disabled={isBatchProcessing || Boolean(busyFileId)}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 ${deleteConfirmation === file.fileId ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-red-500/10 hover:text-red-300'}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deleteConfirmation === file.fileId ? 'Confirmar eliminación' : 'Eliminar de Drive'}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-white/10 bg-[#0B0F19] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} disabled={isBatchProcessing} className="mt-0.5 h-4 w-4 accent-blue-600" />
                  <span><span className="block text-sm font-semibold">Publicar inmediatamente</span><span className="block text-xs text-gray-400">Desactívalo para dejar los nuevos y reemplazos como borradores.</span></span>
                </label>
                <button
                  type="button"
                  onClick={() => void processSelected()}
                  disabled={selectedFiles.length === 0 || isBatchProcessing}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition-[background-color,transform] duration-150 hover:bg-blue-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CloudDownload className={`h-4 w-4 ${isBatchProcessing ? 'animate-pulse' : ''}`} />
                  {isBatchProcessing
                    ? `Procesando la lista…`
                    : selectedFiles.length
                      ? `Procesar ${selectedFiles.length} ${selectedFiles.length === 1 ? 'decisión' : 'decisiones'}`
                      : 'Selecciona qué deseas procesar'}
                </button>
              </div>
            </div>

            <footer className="border-t border-white/10 bg-black/20 px-5 py-3 text-xs text-gray-300" aria-live="polite">
              {message || 'Configura y selecciona los PDFs que deseas procesar.'}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
