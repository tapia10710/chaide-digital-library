import React, { useRef, useState, DragEvent, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn, startsWithSafe, getSafeUrl } from '../../lib/utils';

interface PendingFile {
  id: string;
  file?: File;
  url?: string;
  docId?: string;
  replaceTargetId?: string; // ID of the document to be replaced
  type: 'upload' | 'url' | 'embed';
  title: string;
  size?: number;
  category: string;
  visibility: string;
  status: 'pending' | 'uploading' | 'paused' | 'uploaded' | 'processing' | 'internal_ready' | 'publishing' | 'published' | 'indexing' | 'error' | 'cancelled';
  progress: number;
  errorMessage?: string;
  xhr?: XMLHttpRequest;
  finalPdfUrl?: string;
  downloadUrl?: string;
}

function UploadProgressBar({ status }: { status: PendingFile['status'] }) {
  const steps = [
    { key: "uploaded", label: "Subido" },
    { key: "internal", label: "Sistema" },
    { key: "published", label: "Web" },
    { key: "indexing", label: "Índice" },
  ];

  const getStepState = (status: PendingFile['status'], index: number) => {
    if (status === "error") return "error";
    
    if (status === "pending" || status === "uploading") {
      return "pending";
    }

    if (status === "uploaded") {
      if (index === 0) return "complete";
      return "pending";
    }

    if (status === "processing") {
      if (index === 0) return "complete";
      if (index === 1) return "processing";
      return "pending";
    }

    if (status === "internal_ready") {
      if (index <= 1) return "complete";
      return "pending";
    }

    if (status === "publishing") {
      if (index <= 1) return "complete";
      if (index === 2) return "processing";
      return "pending";
    }

    if (status === "indexing") {
      if (index <= 2) return "complete";
      return "processing";
    }

    if (status === "published") {
      return "complete";
    }

    return "pending";
  };

  const getLineProgress = (status: PendingFile['status']) => {
    switch (status) {
      case 'uploaded': return '0%';
      case 'processing': return '25%';
      case 'internal_ready': return '50%';
      case 'publishing': return '60%';
      case 'indexing': return '80%';
      case 'published': return '100%';
      default: return '0%';
    }
  };

  return (
    <div className="mt-6 mb-2">
      <div className="upload-progress">
        <div className="upload-progress-line">
          <div 
            className="upload-progress-line-fill" 
            style={{ width: getLineProgress(status) }}
          />
        </div>
        {steps.map((step, idx) => {
          const state = getStepState(status, idx);
          return (
            <div key={step.key} className={cn(
              "upload-progress-step",
              state === 'complete' && "is-complete",
              state === 'processing' && "is-processing",
              state === 'pending' && "is-pending",
              state === 'error' && "is-error"
            )}>
              <div className="upload-progress-dot">
                {state === 'complete' && <CheckCircle2 className="w-4 h-4" />}
                {state === 'processing' && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {state === 'error' && <AlertCircle className="w-4 h-4" />}
                {state === 'pending' && <div className="w-2 h-2 bg-gray-400 rounded-full" />}
              </div>
              <span className="upload-progress-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminUploadQueue({ initialReplaceDocId }: { initialReplaceDocId?: string }) {
  const { fetchDocuments, categories, documents } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [globalCategory, setGlobalCategory] = useState(categories[0]?.name || 'Sin categoría');
  const [globalVisibility, setGlobalVisibility] = useState('Público');
  const [isDragging, setIsDragging] = useState(false);
  
  // Custom states for replacement mode
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [replaceTargetId, setReplaceTargetId] = useState<string>('');

  useEffect(() => {
    if (initialReplaceDocId) {
        setMode('replace');
        setReplaceTargetId(initialReplaceDocId);
        // Scroll to the upload manager
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [initialReplaceDocId]);

  const hUploadClick = () => {
    if (mode === 'replace' && !replaceTargetId) {
        alert("Por favor, selecciona primero el documento que deseas reemplazar.");
        return;
    }
    fileInputRef.current?.click();
  };

  const selectedTargetDoc = documents.find(d => d.id === replaceTargetId);

  const handleFiles = (files: FileList | File[]) => {
    const arrFiles = Array.from(files);
    const newFiles = arrFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    
    if (arrFiles.length > 0 && newFiles.length === 0) {
      alert("Por favor, selecciona únicamente archivos en formato PDF.");
      return;
    }

    if (mode === 'replace' && newFiles.length > 1) {
        alert("En el modo de reemplazo, solo puedes subir un archivo a la vez.");
        return;
    }

    const validFiles: File[] = [];
    
    // Check file sizes before accepting. Uploads are sent in 1 MB chunks, so
    // large catalogs are supported; we only cap to avoid accidental huge files.
    const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
    newFiles.forEach(f => {
      if (f.size > MAX_UPLOAD_BYTES) {
         alert(`El archivo ${f.name} supera el límite de 500 MB.`);
         return;
      }
      validFiles.push(f);
    });

    const newPending: PendingFile[] = validFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      type: 'upload',
      title: mode === 'replace' && selectedTargetDoc ? selectedTargetDoc.title : f.name.replace('.pdf', ''),
      replaceTargetId: mode === 'replace' ? replaceTargetId : undefined,
      size: f.size,
      category: mode === 'replace' && selectedTargetDoc ? selectedTargetDoc.category : globalCategory,
      visibility: mode === 'replace' && selectedTargetDoc ? selectedTargetDoc.visibility || 'public' : globalVisibility,
      status: 'pending',
      progress: 0
    }));
    
    setQueue(prev => [...prev, ...newPending]);
    
    // Reset replace state after adding to queue to avoid confusion if adding more later
    if (mode === 'replace') {
        setReplaceTargetId('');
        setMode('new');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };
  
  const updateItemDetails = (id: string, field: string, value: any) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const cancelUpload = (id: string) => {
    const item = queue.find(i => i.id === id);
    if (item && item.xhr) {
      item.xhr.abort();
    }
    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled', progress: 0 } : i));
  };

  const pauseUpload = (id: string) => {
    const item = queue.find(i => i.id === id);
    if (item && item.xhr) {
      item.xhr.abort();
    }
    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'paused' } : i));
  };

  const startUpload = async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item || !item.file) return;

    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'uploading', progress: 0 } : i));

    try {
      const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB chunks for better iframe stability
      const totalChunks = Math.ceil(item.file.size / CHUNK_SIZE);
      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const controller = new AbortController();
      setQueue(prev => prev.map(i => i.id === id ? { ...i, xhr: { abort: () => controller.abort() } as any } : i));

      let lastResult: any = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, item.file.size);
        const chunk = item.file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk, item.file.name);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('fileName', item.file.name);

        if (chunkIndex === totalChunks - 1) {
          formData.append('documentsInfo', JSON.stringify([{
            title: item.title,
            category: item.category,
            visibility: item.visibility
          }]));
        }

        const response = await fetch('/api/documents/upload-chunk', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          if (text.includes('Cookie check') || text.includes('<!doctype html>')) {
            throw new Error("Sesión del editor expirada o bloqueada. Por favor, abre la app en una NUEVA PESTAÑA externa para subir archivos grandes.");
          }
          if (response.status === 413) {
            throw new Error("Fragmento rechazado por tamaño. El límite del proxy fue excedido.");
          }
          throw new Error(`Error del servidor (${response.status})`);
        }

        const data = await response.json();
        lastResult = data;
        
        const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        setQueue(prev => prev.map(i => i.id === id ? { ...i, progress: Math.min(percent, 99) } : i));
      }

      const doc = lastResult[0];
      if (!doc || !doc.id || !doc.fileUrl) {
        throw new Error("Respuesta de finalización no válida del servidor");
      }

      setQueue(prev => prev.map(i => i.id === id ? { 
        ...i, 
        status: 'uploaded',
        docId: doc.id,
        progress: 100,
        finalPdfUrl: doc.fileUrl,
        downloadUrl: doc.fileUrl
      } : i));

      // Continuar automáticamente al proceso interno (metadata & indexing)
      processDocument(id);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled', progress: 0 } : i));
      } else {
        setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMessage: e.message, progress: 0 } : i));
      }
      console.error("Upload error:", e);
    }
  };

  // Stage 2: System Processing (Metadata & Cover)
  const processDocument = async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item || !item.docId) return;

    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'processing' } : i));

    try {
      let pageCount = 0;
      let coverUrl = '';
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      
      // Use local file for processing if available to avoid re-downloading large files
      let pdfData: any;
      let objectUrl: string | null = null;
      if (item.file) {
        // Use an object URL instead of arrayBuffer for efficiency and to avoid memory spikes
        objectUrl = URL.createObjectURL(item.file);
        pdfData = objectUrl;
      } else {
        // Fallback to URL if file is not in memory (e.g. from a past session or URL import)
        const res = await fetch(`/api/documents/${item.docId}`, { credentials: 'include' });
        if (!res.ok) throw new Error("No se pudo obtener la información del documento");
        const doc = await res.json();
        pdfData = doc.fileUrl;
      }

      const isVeryLarge = item.size && item.size > 150 * 1024 * 1024; // 150MB limit for local rendering
      
      const loadingTask = pdfjsLib.getDocument(pdfData);
      
      const pdfDoc = await loadingTask.promise;
      pageCount = pdfDoc.numPages;
      
      // Render cover only if not extremely large to prevent browser hang
      if (!isVeryLarge) {
        try {
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 }); // Maximum resolution for identifying catalogs
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            coverUrl = canvas.toDataURL('image/jpeg', 0.95); // High quality
          }
        } catch (renderError) {
          console.error("Error rendering cover:", renderError);
          // Don't fail the whole process if only cover fails
        }
      }

      // Cleanup PDF.js
      await pdfDoc.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      await fetch(`/api/documents/${item.docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          pageCount, 
          coverUrl: coverUrl || undefined // Only update if generated
        })
      });

      setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'internal_ready' } : i));
    } catch (e: any) {
      console.error("Processing error:", e);
      setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMessage: e.message } : i));
    }
  };

  const createIndexForDocument = async (id: string, docId: string, pdfUrl: string) => {
    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'indexing' } : i));
    try {
        const { buildIndexDirectly } = await import('../../lib/pdfIndexerService');
        const indexItems = await buildIndexDirectly(pdfUrl);
        await fetch(`/api/documents/${docId}/index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ indexItems })
        });
        setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'published' } : i));
        fetchDocuments(true);
    } catch (e: any) {
        console.error("Indexing error:", e);
        setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMessage: "No se pudo crear el índice: " + e.message } : i));
    }
  };

  // Stage 3: Publish / Replace logic
  const publishDocument = async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item || !item.docId || !item.finalPdfUrl) return;

    setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'publishing' } : i));

    try {
      if (item.replaceTargetId) {
        const swapRes = await fetch(`/api/documents/${item.replaceTargetId}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newDocId: item.docId })
        });
        if (!swapRes.ok) {
            const err = await swapRes.json().catch(() => ({}));
            throw new Error(err.error || "Error al realizar el reemplazo seguro.");
        }
      } else {
        await fetch(`/api/documents/${item.docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'ready' })
        });
      }

      await createIndexForDocument(id, item.replaceTargetId || item.docId, item.finalPdfUrl);
    } catch (e: any) {
      setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMessage: e.message } : i));
    }
  };

  const handleUploadAll = async () => {
    const pending = queue.filter(i => i.status === 'pending');
    for (const item of pending) {
      await startUpload(item.id);
    }
  };

  const isAnyUploading = queue.some(i => ['uploading', 'processing', 'publishing'].includes(i.status));
  
  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-8 text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        .upload-progress {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          position: relative;
        }

        .upload-progress-line {
          position: absolute;
          top: 13px;
          left: calc(100% / 8);
          right: calc(100% / 8);
          height: 2px;
          background: rgba(255, 255, 255, 0.1);
          z-index: 0;
        }

        .upload-progress-line-fill {
          height: 100%;
          background: #2563eb;
          transition: width 0.5s ease-out;
        }

        .upload-progress-step {
          position: relative;
          z-index: 1;
          display: grid;
          justify-items: center;
          gap: 6px;
          text-align: center;
        }

        .upload-progress-dot {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #1f2937;
          border: 2px solid #374151;
          display: grid;
          place-items: center;
          transition: all 0.3s ease;
          color: #9ca3af;
        }

        .upload-progress-step.is-complete .upload-progress-dot {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }

        .upload-progress-step.is-processing .upload-progress-dot {
          background: #1e3a8a;
          border-color: #3b82f6;
          color: #fff;
          animation: glue-pulse 1.2s infinite;
        }

        .upload-progress-step.is-error .upload-progress-dot {
          background: #7f1d1d;
          border-color: #ef4444;
          color: #fff;
        }

        .upload-progress-label {
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .upload-progress-step.is-complete .upload-progress-label,
        .upload-progress-step.is-processing .upload-progress-label {
          color: #fff;
        }

        @keyframes glue-pulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
      `}} />

      <div className="flex flex-col gap-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Gestor de Carga Estructurada</h2>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-white/5 p-1 rounded-xl w-fit border border-white/10">
          <button 
            onClick={() => setMode('new')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              mode === 'new' ? "bg-white text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            Nueva publicación
          </button>
          <button 
            onClick={() => setMode('replace')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              mode === 'replace' ? "bg-white text-black shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            Reemplazar existente
          </button>
        </div>

        {mode === 'replace' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
             <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Selecciona el documento que deseas reemplazar
                </label>
                <select 
                  value={replaceTargetId}
                  onChange={(e) => setReplaceTargetId(e.target.value)}
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                >
                  <option value="">-- Seleccionar documento --</option>
                  {documents.filter(d => d.status === 'ready').map(doc => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.category})
                    </option>
                  ))}
                </select>
             </div>

             {selectedTargetDoc && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4">
                   <img 
                    src={selectedTargetDoc.coverUrl} 
                    alt="" 
                    className="w-16 h-24 object-cover rounded-lg border border-white/10 shadow-sm"
                   />
                   <div className="flex flex-col justify-center">
                      <h4 className="font-bold text-white leading-tight">{selectedTargetDoc.title}</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                         <div className="flex items-center gap-1">
                            <span className="text-gray-500">Páginas:</span> {selectedTargetDoc.pageCount}
                         </div>
                         <div className="flex items-center gap-1">
                            <span className="text-gray-500">Categoría:</span> {selectedTargetDoc.category}
                         </div>
                         <div className="flex items-center gap-1">
                            <span className="text-gray-500">Estado:</span> <span className="text-emerald-400">Publicado</span>
                         </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Fuente:</span> {selectedTargetDoc.sourceType || 'upload'}
                         </div>
                      </div>
                   </div>
                </div>
             )}
          </div>
        )}
      </div>
      
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer mb-6",
            isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/30 truncate bg-white/[0.01]',
            mode === 'replace' && !replaceTargetId && 'opacity-50 cursor-not-allowed grayscale pointer-events-none'
        )}
        onClick={hUploadClick}
      >
        <Upload className="w-10 h-10 text-gray-500 mb-3" />
        <p className="text-gray-300 font-medium">
            {mode === 'replace' ? 'Sube el PDF de reemplazo' : 'Arrastra tus PDFs aquí'}
        </p>
        <p className="text-gray-500 text-sm mt-1">
            {mode === 'replace' 
                ? 'El archivo cargado sustituirá al documento seleccionado de forma segura' 
                : 'Sube archivos y sigue el flujo de validación'}
        </p>
        <input 
          type="file" 
          accept="application/pdf"
          multiple={mode === 'new'}
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {queue.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="font-semibold text-sm text-gray-400 uppercase tracking-widest">Cola de Gestión ({queue.length})</h3>
            {queue.some(i => i.status === 'published') && (
              <button 
                onClick={() => setQueue(prev => prev.filter(i => i.status !== 'published'))}
                className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-3 py-1 rounded-md border border-white/10 transition-colors uppercase font-bold tracking-wider"
              >
                Limpiar completados
              </button>
            )}
          </div>

          <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {queue.map(item => (
              <div key={item.id} className="bg-[#0B0F19] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                      <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-100 truncate max-w-[200px]">{item.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black uppercase bg-white/10 px-2 py-0.5 rounded text-gray-400 tracking-tighter">
                          {item.category}
                        </span>
                        <span className="text-xs text-gray-500">
                          {item.size ? (item.size / (1024*1024)).toFixed(1) + ' MB' : '0 MB'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {['pending', 'uploaded', 'error', 'cancelled', 'paused', 'published'].includes(item.status) && (
                    <button 
                      onClick={() => removeFromQueue(item.id)} 
                      className="group flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
                      title="Quitar de la lista"
                    >
                      <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                  )}
                </div>

                <UploadProgressBar status={item.status} />

                {item.replaceTargetId && (
                    <div className="text-[10px] text-blue-400 font-black uppercase tracking-widest flex items-center gap-2 bg-blue-400/5 p-2 rounded-lg border border-blue-400/10">
                        <AlertCircle className="w-3 h-3" />
                        Este archivo reemplazará al documento: {documents.find(d => d.id === item.replaceTargetId)?.title}
                    </div>
                )}

                <div className="flex items-center justify-end mt-2 pt-4 border-t border-white/5 gap-3">
                  {item.status === 'pending' && (
                    <button 
                      onClick={() => startUpload(item.id)}
                      className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                      Iniciar proceso
                    </button>
                  )}
                  {item.status === 'uploading' && (
                    <div className="flex flex-col items-end gap-2 w-full">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col items-start">
                          <span className="text-blue-400 text-xs font-bold animate-pulse">
                            Subiendo archivo...
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-blue-400 text-xs font-bold">{item.progress}%</span>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => pauseUpload(item.id)}
                               className="text-[10px] text-yellow-500 hover:text-yellow-400 font-bold uppercase tracking-tighter"
                             >
                               Pausar
                             </button>
                             <button 
                               onClick={() => cancelUpload(item.id)}
                               className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase tracking-tighter"
                             >
                               Cancelar
                             </button>
                          </div>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  )}
                  {item.status === 'uploaded' && (
                    <button 
                      onClick={() => processDocument(item.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-500/20"
                    >
                      Pasar al sistema interno
                    </button>
                  )}
                  {item.status === 'processing' && (
                    <span className="text-purple-400 text-xs font-bold flex items-center gap-2">
                       <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                       Procesando en sistema...
                    </span>
                  )}
                  {item.status === 'internal_ready' && (
                    <button 
                      onClick={() => publishDocument(item.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/20"
                    >
                      {item.replaceTargetId ? 'Realizar reemplazo seguro' : 'Implementar en la web'}
                    </button>
                  )}
                  {item.status === 'publishing' && (
                    <span className="text-emerald-400 text-xs font-bold animate-pulse">
                        {item.replaceTargetId ? 'Actualizando documento y eliminando anterior...' : 'Publicando en plataforma...'}
                    </span>
                  )}
                  {item.status === 'indexing' && (
                    <span className="text-orange-400 text-xs font-bold flex items-center gap-2">
                       <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                       Creando índice del catálogo...
                    </span>
                  )}
                  {item.status === 'published' && (
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> {item.replaceTargetId ? 'Reemplazo exitoso' : 'Disponible'}
                      </span>
                      <button 
                        onClick={() => window.open(`/viewer/${item.docId}`, '_blank')}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all border border-white/10"
                      >
                        Ver en plataforma
                      </button>
                    </div>
                  )}
                  {item.status === 'paused' && (
                    <div className="flex items-center gap-3">
                      <span className="text-yellow-500 text-xs font-bold uppercase">Pausado</span>
                      <button 
                        onClick={() => startUpload(item.id)}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-yellow-500/30"
                      >
                        Reanudar
                      </button>
                    </div>
                  )}
                  {item.status === 'cancelled' && (
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-xs font-bold uppercase">Cancelado</span>
                      <button 
                        onClick={() => startUpload(item.id)}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                      >
                        Reiniciar
                      </button>
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="flex items-center gap-3">
                      <span className="text-red-400 text-xs font-bold">{item.errorMessage || "Error"}</span>
                      {item.errorMessage?.includes("No se pudo crear el índice") ? (
                        <button 
                            onClick={() => item.docId && item.finalPdfUrl && createIndexForDocument(item.id, item.docId, item.finalPdfUrl)}
                            className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-orange-500/30"
                        >
                            Reintentar creación de índice
                        </button>
                      ) : (
                        <button 
                            onClick={() => startUpload(item.id)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-red-500/30"
                        >
                            Reintentar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-white/10 flex items-center justify-between">
            <p className="text-xs text-gray-500 italic">Cada archivo requiere aprobación manual en cada etapa del proceso.</p>
            <button 
              onClick={handleUploadAll}
              disabled={isAnyUploading || !queue.some(i => i.status === 'pending')}
              className="bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-xl active:scale-95"
            >
              Cargar Todo (Paso 1)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
