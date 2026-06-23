import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import PdfViewer from '../components/preview/PdfViewer';

export default function ViewerPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialPage = parseInt(searchParams.get('page') || '1');
  const initialSearch = searchParams.get('search') || '';
  const { documents, fetchDocuments, isLoadingDocs, hasLoadedDocs } = useStore();
  const doc = useMemo(() => documents.find((document) => document.id === id) || null, [documents, id]);

  useEffect(() => {
    if (!hasLoadedDocs && !isLoadingDocs) {
      fetchDocuments();
    }
  }, [fetchDocuments, hasLoadedDocs, isLoadingDocs]);

  if (!hasLoadedDocs || isLoadingDocs) {
    return (
      <div className="fixed inset-0 bg-[#0B0F19] flex items-center justify-center text-white flex-col gap-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Iniciando visor...</p>
      </div>
    );
  }

  if (!doc) {
     return (
        <div className="fixed inset-0 bg-[#0B0F19] flex items-center justify-center text-white flex-col gap-4 p-4 text-center">
          <div className="text-red-500 text-4xl mb-2">×</div>
          <h2 className="text-xl font-bold">Catálogo no encontrado</h2>
          <p className="text-gray-400 max-w-xs">El documento solicitado no existe o ha sido eliminado.</p>
          <button onClick={() => navigate('/')} className="mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Volver a la biblioteca
          </button>
        </div>
     );
  }

  const urlToUse = doc ? ((typeof doc.fileUrl === 'string' && doc.fileUrl.trim().startsWith('<')) || (typeof doc.fileUrl === 'string' && doc.fileUrl.includes('<script')) 
      ? doc.fileUrl 
      : (doc.fileUrl ? doc.fileUrl : doc.externalUrl)) : '';

  const downloadUrl = (doc && typeof doc.fileUrl === 'string' && !doc.fileUrl.trim().startsWith('<'))
      ? doc.fileUrl
      : (doc && typeof doc.externalUrl === 'string' && doc.externalUrl.startsWith('http') ? doc.externalUrl : undefined);

  return (
    <div className="min-h-screen bg-[#f5f5f2] selection:bg-blue-500 selection:text-white">
       <PdfViewer 
          documentId={doc.id}
          url={urlToUse || ''} 
          title={doc.title} 
          onClose={() => navigate('/')} 
          downloadUrl={downloadUrl}
          initialPage={initialPage}
          initialSearch={initialSearch}
       />
    </div>
  );
}
