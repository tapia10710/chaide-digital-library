import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CloudUpload, FileText, Image as ImageIcon } from 'lucide-react';
import {
  deleteFileFromDrive,
  uploadFileToDrive,
} from '../../lib/firebaseCatalog';
import { preparePdfCatalog } from '../../lib/catalogSearchIndex';
import { publishPreparedFirebasePdf } from '../../lib/firebaseCatalogPublication';
import { useStore } from '../../store/useStore';

export default function FirebaseUploadPanel({
  initialReplaceDocId,
}: {
  initialReplaceDocId?: string;
}) {
  const { categories, documents, addDocument, fetchDocuments } = useStore();
  const replaceDocument = useMemo(
    () => documents.find((item) => item.id === initialReplaceDocId),
    [documents, initialReplaceDocId],
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
    if (!pdf) missing.push('seleccionar el PDF');
    if (title.trim().length < 3) missing.push('título');
    if (description.trim().length < 10) missing.push('descripción');
    if (!category) missing.push('categoría');
    return missing;
  }, [pdf, title, description, category]);

  useEffect(() => {
    if (!replaceDocument) return;
    setTitle(replaceDocument.title);
    setDescription(replaceDocument.description || '');
    setCategory(replaceDocument.category || '');
    setTags((replaceDocument.tags || []).join(', '));
    setPublishNow(replaceDocument.visibility !== 'private' && replaceDocument.isActive !== false);
    setMessage(`Reemplazando el PDF de “${replaceDocument.title}”.`);
  }, [replaceDocument]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setTags('');
    setPdf(null);
    setCover(null);
    setPublishNow(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
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
    if (pdf.size > 35 * 1024 * 1024) {
      setMessage('El PDF supera el límite de 35 MB del puente gratuito.');
      return;
    }

    setIsUploading(true);
    setMessage('Preparando el PDF para el visor integrado…');
    let newDriveFileId = '';
    let newCoverFileId = '';
    let publicationCommitted = false;
    try {
      const id = replaceDocument?.id || `doc-${Date.now().toString(36)}`;
      const prepared = await preparePdfCatalog(pdf, (progress) => {
        setMessage(`Validando páginas y texto del PDF… ${progress}%`);
      });
      setMessage('Creando respaldo en Google Drive…');
      const driveBackup = await uploadFileToDrive(pdf, 'catalogs');
      newDriveFileId = driveBackup.fileId;
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
        driveBackupStatus: 'ready' as const,
        fileSize: pdf.size,
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
        pdf,
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
        fileSize: pdf.size,
        searchIndexStatus: prepared.searchablePages > 0 ? 'ready' as const : 'no-text' as const,
        status: 'ready' as const,
      };
      publicationCommitted = true;
      if (!replaceDocument) addDocument(publishedValue);
      await fetchDocuments(true);
      if (replaceDocument?.driveFileId && replaceDocument.driveFileId !== driveBackup.fileId) {
        await deleteFileFromDrive(replaceDocument.driveFileId).catch(() => undefined);
      }
      if (replaceDocument?.coverFileId && replaceDocument.coverFileId !== coverResult?.fileId) {
        await deleteFileFromDrive(replaceDocument.coverFileId).catch(() => undefined);
      }
      reset();
      const publicationMessage = publishNow
        ? (replaceDocument ? 'PDF reemplazado y publicado.' : 'Catálogo publicado correctamente.')
        : 'Catálogo guardado como borrador privado.';
      const searchMessage = prepared.searchablePages > 0
        ? 'Respaldo e índice verificados.'
        : 'El visor funciona, pero el PDF no tiene texto buscable; puede publicarse después de aplicar OCR.';
      setMessage(`${publicationMessage} ${searchMessage}`);
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
    <section className="bg-[#111827] border border-white/10 rounded-2xl p-6 text-white">
      <div className="flex items-center gap-3 mb-5">
        <CloudUpload className="w-6 h-6 text-blue-400" />
        <div>
          <h2 className="font-semibold text-lg">
            {replaceDocument ? 'Reemplazar catálogo' : 'Publicar catálogo'}
          </h2>
          <p className="text-xs text-gray-400">PDF para el visor en Firestore y respaldo adicional en Drive.</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Título del catálogo"
          className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3"
        >
          <option value="">Seleccionar categoría</option>
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
        <label className="flex items-center gap-3 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
          <FileText className="w-5 h-5 text-red-400" />
          <span className="text-sm truncate">{pdf?.name || 'Seleccionar PDF (máximo 35 MB)'}</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => selectPdf(event.target.files?.[0] || null)} />
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
          <input type="file" accept="image/*" className="hidden" onChange={(event) => setCover(event.target.files?.[0] || null)} />
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
            disabled={isUploading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-3 rounded-xl font-semibold"
          >
            {isUploading
              ? 'Publicando…'
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
