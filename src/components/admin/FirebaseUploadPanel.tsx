import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CloudUpload, FileText, Image as ImageIcon } from 'lucide-react';
import {
  deleteDriveFilesReliably,
  deleteFileFromDrive,
  uploadFileToDrive,
} from '../../lib/firebaseCatalog';
import { preparePdfCatalog } from '../../lib/catalogSearchIndex';
import { publishPreparedFirebasePdf } from '../../lib/firebaseCatalogPublication';
import { useStore } from '../../store/useStore';
import { findFallbackCategory } from '../../lib/categoryStructure';

export default function FirebaseUploadPanel({
  initialReplaceDocId,
}: {
  initialReplaceDocId?: string;
}) {
  const {
    categories,
    documents,
    isLoadingDocs,
    addDocument,
    fetchDocuments,
  } = useStore();
  const [mode, setMode] = useState<'new' | 'replace'>(
    initialReplaceDocId ? 'replace' : 'new',
  );
  const [replaceTargetId, setReplaceTargetId] = useState(initialReplaceDocId || '');
  const replaceableDocuments = useMemo(
    () => [...documents].sort((left, right) =>
      left.title.localeCompare(right.title, 'es', { sensitivity: 'base' })),
    [documents],
  );
  const replaceDocument = useMemo(
    () => mode === 'replace'
      ? documents.find((item) => item.id === replaceTargetId)
      : undefined,
    [documents, mode, replaceTargetId],
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [publishNow, setPublishNow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (mode === 'replace' && !replaceDocument) missing.push('catálogo que se reemplazará');
    if (!pdf) missing.push('seleccionar el PDF');
    if (title.trim().length < 3) missing.push('título');
    if (description.trim().length < 10) missing.push('descripción');
    if (!category) missing.push('categoría');
    return missing;
  }, [mode, replaceDocument, pdf, title, description, category]);

  useEffect(() => {
    if (!initialReplaceDocId) return;
    setMode('replace');
    setReplaceTargetId(initialReplaceDocId);
  }, [initialReplaceDocId]);

  useEffect(() => {
    if (!replaceDocument) return;
    setPdf(null);
    setCover(null);
    setTitle(replaceDocument.title);
    setDescription(replaceDocument.description || '');
    setCategory(replaceDocument.category || '');
    setTags((replaceDocument.tags || []).join(', '));
    setPublishNow(replaceDocument.visibility !== 'private' && replaceDocument.isActive !== false);
    setMessage(`Reemplazando el PDF de “${replaceDocument.title}”.`);
  }, [replaceDocument?.id]);

  useEffect(() => {
    if (mode !== 'new' || category || categories.length === 0) return;
    const fallback = findFallbackCategory(categories.filter((item) => item.active !== false));
    if (fallback) setCategory(fallback.name);
  }, [categories, category, mode]);

  useEffect(() => {
    if (!isUploading) return undefined;
    const preventAccidentalExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [isUploading]);

  const clearFormFields = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setTags('');
    setPdf(null);
    setCover(null);
    setPublishNow(false);
  };

  const reset = () => {
    clearFormFields();
    setMode('new');
    setReplaceTargetId('');
  };

  const changeMode = (nextMode: 'new' | 'replace') => {
    if (isUploading || nextMode === mode) return;
    clearFormFields();
    setMode(nextMode);
    setReplaceTargetId('');
    setMessage(
      nextMode === 'replace'
        ? 'Selecciona el catálogo cuyo PDF deseas reemplazar.'
        : 'Selecciona un PDF para crear un catálogo nuevo.',
    );
  };

  const changeReplaceTarget = (id: string) => {
    if (isUploading) return;
    clearFormFields();
    setReplaceTargetId(id);
    setMessage(
      id
        ? 'Cargando la información del catálogo seleccionado…'
        : 'Selecciona el catálogo que deseas reemplazar.',
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'replace' && !replaceDocument) {
      setMessage('Selecciona primero el catálogo que deseas reemplazar.');
      return;
    }
    if (!pdf) {
      setMessage('Selecciona primero el archivo PDF que deseas publicar.');
      return;
    }
    if (title.trim().length < 3) {
      setMessage('El título debe tener al menos 3 caracteres.');
      return;
    }
    if (description.trim().length < 10) {
      setMessage('Añade una descripción de al menos 10 caracteres para que el catálogo pueda encontrarse.');
      return;
    }
    if (!category) {
      setMessage('Selecciona una categoría válida.');
      return;
    }
    if (pdf.type !== 'application/pdf' && !pdf.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Selecciona un archivo PDF válido.');
      return;
    }
    setIsUploading(true);
    setMessage('Preparando el PDF para el visor integrado…');
    let newDriveFileId = '';
    let newCoverFileId = '';
    let publicationCommitted = false;
    try {
      const id = replaceDocument?.id || `doc-${Date.now().toString(36)}`;
      setMessage('Procesando el PDF y copiándolo a Drive en paralelo…');
      let preparationProgress = 0;
      let driveProgress = 0;
      const reportParallelProgress = () => {
        setMessage(`Preparando visor: ${preparationProgress}% · Respaldo en Drive: ${driveProgress}%`);
      };
      const [preparedResult, driveResult] = await Promise.allSettled([
        preparePdfCatalog(pdf, (progress) => {
          preparationProgress = progress;
          reportParallelProgress();
        }),
        uploadFileToDrive(pdf, 'catalogs', (progress) => {
          driveProgress = progress;
          reportParallelProgress();
        }),
      ]);
      if (driveResult.status === 'fulfilled') newDriveFileId = driveResult.value.fileId;
      if (preparedResult.status === 'rejected') throw preparedResult.reason;
      if (driveResult.status === 'rejected') throw driveResult.reason;
      const prepared = preparedResult.value;
      const driveBackup = driveResult.value;
      const coverToUpload = cover || prepared.generatedCover;
      setMessage(cover ? 'Guardando portada seleccionada…' : 'Generando y guardando portada automática…');
      const coverResult = coverToUpload ? await uploadFileToDrive(coverToUpload, 'covers') : null;
      newCoverFileId = coverResult?.fileId || '';
      const value = {
        ...(replaceDocument || {}),
        id,
        title: title.trim(),
        description: description.trim(),
        category,
        pageCount: prepared.pageCount,
        coverUrl: coverResult?.thumbnailUrl || coverResult?.driveUrl || replaceDocument?.coverUrl || '',
        coverFileId: coverResult?.fileId || replaceDocument?.coverFileId || '',
        externalUrl: driveBackup.downloadUrl,
        driveFileId: driveBackup.fileId,
        driveMd5Checksum: driveBackup.md5Checksum || '',
        driveHistoricalFileIds: replaceDocument
          ? Array.from(new Set([
              ...(replaceDocument.driveHistoricalFileIds || []),
              replaceDocument.driveFileId || '',
            ].filter(Boolean)))
          : [],
        driveBackupStatus: 'ready' as const,
        fileSize: prepared.viewerFile.size,
        viewerOptimization: prepared.viewerOptimization,
        tags: Array.from(new Set(
          tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        )),
        sourceType: 'upload' as const,
        visibility: publishNow ? 'public' : 'private',
        isActive: publishNow,
        priority: replaceDocument?.priority ?? 5,
        indexItems: prepared.indexItems,
      };

      const publication = await publishPreparedFirebasePdf(
        id,
        prepared,
        value,
        (stage, progress) => {
          setMessage(`${stage}…${progress === undefined ? '' : ` ${progress}%`}`);
        },
      );
      const publishedValue = {
        ...value,
        ...publication,
        pageCount: prepared.pageCount,
        fileSize: prepared.viewerFile.size,
        searchIndexStatus: prepared.searchablePages > 0 ? 'ready' as const : 'no-text' as const,
        status: 'ready' as const,
      };
      publicationCommitted = true;
      if (!replaceDocument) addDocument(publishedValue);
      let refreshWarning = '';
      try {
        await fetchDocuments(true);
      } catch {
        refreshWarning = ' La publicación quedó guardada; refresca la biblioteca si todavía no aparece en la tabla.';
      }
      const obsoleteDriveIds = replaceDocument
        ? [
            replaceDocument.driveFileId && replaceDocument.driveFileId !== driveBackup.fileId
              ? replaceDocument.driveFileId
              : '',
            coverResult?.fileId &&
            replaceDocument.coverFileId &&
            replaceDocument.coverFileId !== coverResult.fileId
              ? replaceDocument.coverFileId
              : '',
          ].filter(Boolean) as string[]
        : [];
      const cleanup = obsoleteDriveIds.length
        ? await deleteDriveFilesReliably(id, obsoleteDriveIds)
        : { pending: [] as string[] };
      reset();
      const publicationMessage = publishNow
        ? (replaceDocument ? 'PDF reemplazado y publicado.' : 'Catálogo publicado correctamente.')
        : 'Catálogo guardado como borrador privado.';
      const searchMessage = prepared.searchablePages > 0
        ? 'Respaldo e índice verificados.'
        : 'El visor funciona, pero el PDF no tiene texto buscable; puede publicarse después de aplicar OCR.';
      const optimizationMessage = prepared.viewerOptimization.mode === 'flattened'
        ? `El visor recibió una copia optimizada (${(prepared.viewerFile.size / 1024 / 1024).toFixed(1)} MB) y Drive conserva el original.`
        : 'El PDF superó el control de rendimiento del visor.';
      const cleanupWarning = cleanup.pending.length
        ? ' La versión nueva está segura; la limpieza anterior se reintentará automáticamente.'
        : '';
      setMessage(`${publicationMessage} ${searchMessage} ${optimizationMessage}${cleanupWarning}${refreshWarning}`);
    } catch (error) {
      if (!publicationCommitted) {
        await Promise.allSettled([
          newDriveFileId ? deleteFileFromDrive(newDriveFileId) : Promise.resolve(),
          newCoverFileId ? deleteFileFromDrive(newCoverFileId) : Promise.resolve(),
        ]);
      }
      setMessage(error instanceof Error ? error.message : 'No se pudo publicar el catálogo.');
    } finally {
      setIsUploading(false);
    }
  };

  const selectPdf = (file: File | null) => {
    setPdf(file);
    if (!file) {
      setMessage('Selecciona el archivo PDF que deseas publicar.');
      return;
    }
    const suggestedTitle = file.name
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title.trim()) setTitle(suggestedTitle);
    if (!description.trim()) {
      setDescription(`Catálogo digital ${suggestedTitle}.`);
    }
    setMessage('PDF seleccionado. Revisa el título, la descripción y elige una categoría.');
  };

  return (
    <section
      id="admin-pdf-operation-panel"
      className="bg-[#111827] border border-white/10 rounded-2xl p-6 text-white scroll-mt-24"
    >
      <div className="flex items-center gap-3 mb-5">
        <CloudUpload className="w-6 h-6 text-blue-400" />
        <div>
          <h2 className="font-semibold text-lg">
            {mode === 'replace' ? 'Reemplazar catálogo' : 'Publicar catálogo'}
          </h2>
          <p className="text-xs text-gray-400">
            {mode === 'replace'
              ? 'Actualiza el PDF, la portada y el índice conservando el mismo catálogo.'
              : 'PDF para el visor en Firestore y respaldo adicional en Drive.'}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
              Operación
            </span>
            <select
              value={mode}
              disabled={isUploading}
              onChange={(event) => changeMode(event.target.value as 'new' | 'replace')}
              className="min-h-12 rounded-xl border border-white/10 bg-[#0B0F19] px-4 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
              aria-label="Elegir entre subir un PDF nuevo o reemplazar uno existente"
            >
              <option value="new">Subir PDF nuevo</option>
              <option value="replace">Reemplazar PDF existente</option>
            </select>
          </label>

          {mode === 'replace' ? (
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
                Catálogo que se reemplazará
              </span>
              <select
                value={replaceTargetId}
                disabled={isUploading || isLoadingDocs || replaceableDocuments.length === 0}
                onChange={(event) => changeReplaceTarget(event.target.value)}
                className="min-h-12 rounded-xl border border-white/10 bg-[#0B0F19] px-4 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                aria-label="Seleccionar el catálogo que se reemplazará"
              >
                <option value="">
                  {isLoadingDocs
                    ? 'Cargando catálogos…'
                    : replaceableDocuments.length
                      ? 'Seleccionar catálogo'
                      : 'No hay catálogos disponibles'}
                </option>
                {replaceableDocuments.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title} · {document.pageCount || 0} páginas
                    {document.visibility === 'private' || document.isActive === false
                      ? ' · borrador'
                      : ' · publicado'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex items-end">
              <p className="pb-3 text-sm text-gray-300">
                Se creará una publicación nueva sin modificar los catálogos existentes.
              </p>
            </div>
          )}
        </div>

        {mode === 'replace' && replaceDocument ? (
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-3">
            {replaceDocument.coverUrl ? (
              <img
                src={replaceDocument.coverUrl}
                alt=""
                className="h-20 w-14 shrink-0 rounded-md object-cover shadow-lg"
              />
            ) : (
              <div className="grid h-20 w-14 shrink-0 place-items-center rounded-md bg-white/5">
                <FileText className="h-5 w-5 text-gray-500" />
              </div>
            )}
            <div className="min-w-0">
              <strong className="block truncate text-sm text-white">{replaceDocument.title}</strong>
              <span className="mt-1 block text-xs text-gray-400">
                {replaceDocument.pageCount || 0} páginas · {replaceDocument.category || 'Sin categoría'}
              </span>
              <span className="mt-2 block text-xs text-amber-200">
                El nuevo PDF, portada e índice sustituirán esta versión después de validarse.
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Título del catálogo"
          className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        />
        <select
          aria-label="Categoría del catálogo"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        >
          <option value="">Seleccionar categoría</option>
          {category && !categories.some((item) =>
            item.active !== false &&
            item.name.localeCompare(category, 'es', { sensitivity: 'base' }) === 0
          ) ? (
            <option value={category}>{category} (categoría actual)</option>
          ) : null}
          {categories
            .filter((item) => item.active !== false)
            .map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Descripción"
          className="lg:col-span-2 min-h-24 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        />
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="Etiquetas separadas por coma: colchones, hoteles, descanso"
          className="lg:col-span-2 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        />
        <label
          className={`flex items-center gap-3 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 cursor-pointer ${
            mode === 'replace' && !replaceDocument ? 'pointer-events-none opacity-45' : ''
          }`}
        >
          <FileText className="w-5 h-5 text-red-400" />
          <span className="text-sm truncate">
            {pdf?.name || (
              mode === 'replace' && !replaceDocument
                ? 'Primero selecciona el catálogo'
                : 'Seleccionar PDF (sin límite definido por la aplicación)'
            )}
          </span>
          <input
            key={`pdf-${mode}-${replaceTargetId}`}
            type="file"
            accept="application/pdf,.pdf"
            disabled={mode === 'replace' && !replaceDocument}
            className="hidden"
            onChange={(event) => selectPdf(event.target.files?.[0] || null)}
          />
        </label>
        <label className="lg:col-span-2 flex items-start gap-3 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(event) => setPublishNow(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5"
          />
          <span>
            <span className="block text-sm font-semibold">Publicar inmediatamente</span>
            <span className="block text-xs text-gray-400">
              Desactivado guarda el PDF como borrador privado para revisarlo en el administrador antes de hacerlo público.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
          <ImageIcon className="w-5 h-5 text-emerald-400" />
          <span className="text-sm truncate">{cover?.name || 'Portada opcional'}</span>
          <input
            key={`cover-${mode}-${replaceTargetId}`}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => setCover(event.target.files?.[0] || null)}
          />
        </label>
        <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-300 flex items-center gap-2">
              {message && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {message}
            </p>
            {!isUploading && (
              <p className={`mt-1 text-xs ${missingRequirements.length ? 'text-amber-300' : 'text-emerald-300'}`}>
                {missingRequirements.length
                  ? `Antes de publicar falta: ${missingRequirements.join(', ')}.`
                  : 'Todo listo para publicar.'}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isUploading || (mode === 'replace' && !replaceDocument)}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-3 rounded-xl font-semibold"
          >
            {isUploading
              ? 'Publicando…'
              : mode === 'replace' && !replaceDocument
                ? 'Selecciona un catálogo'
              : replaceDocument
                ? 'Reemplazar PDF'
                : missingRequirements.length
                  ? 'Revisar y publicar'
                  : publishNow ? 'Publicar catálogo' : 'Guardar borrador'}
          </button>
        </div>
      </form>
    </section>
  );
}
