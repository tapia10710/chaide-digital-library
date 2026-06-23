import React, { useEffect, useRef, useState } from 'react';
import { FileText, Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { DocumentDef } from '../lib/mockData';
import AdminUploadQueue from '../components/admin/AdminUploadQueue';
import AdminLinkImport from '../components/admin/AdminLinkImport';
import AdminEditModal from '../components/admin/AdminEditModal';
import CategoryManager from '../components/admin/CategoryManager';
import PromotionalBannerManager from '../components/admin/PromotionalBannerManager';
import { motion, AnimatePresence } from 'motion/react';

function DeleteButton({ onDelete, docTitle }: { onDelete: () => void, docTitle: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
      setConfirming(false);
    }
  };

  if (isDeleting) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-red-500/10 rounded">
        <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-[10px] font-bold text-red-100 uppercase">Borrando...</span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 bg-red-600 rounded overflow-hidden p-0.5 shadow-lg border border-red-400">
        <button 
          onClick={handleConfirm}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
        >
          Borrar Sí
        </button>
        <div className="w-[1px] h-4 bg-white/20"></div>
        <button 
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={() => setConfirming(true)}
      title={`Eliminar ${docTitle}`}
      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

export default function AdminDashboard() {
  const { documents, removeDocument, fetchDocuments, fetchCategories, fetchPromotionalBanner, role } = useStore();
  const [editingDoc, setEditingDoc] = useState<DocumentDef | null>(null);
  const [replaceDocId, setReplaceDocId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const didInitialLoadRef = useRef(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchDocuments(true), fetchCategories(), fetchPromotionalBanner()]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/');
      return;
    }

    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;

    fetchDocuments(true);
    fetchCategories();
    fetchPromotionalBanner();
  }, [fetchDocuments, fetchCategories, fetchPromotionalBanner, role, navigate]);

  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const traducirSource = (source?: string) => {
    if (source === 'upload') return 'Local';
    if (source === 'url') return 'URL/Drive';
    if (source === 'embed') return 'Embed';
    return 'Local';
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Panel Administrador</h1>
          <p className="text-gray-400 mt-1">Gestiona la biblioteca digital, sube PDFs y ajusta configuraciones.</p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
        >
          <div className={isRefreshing ? "animate-spin" : ""}>
             <Search className="w-4 h-4 translate-x-[-1px] rotate-90" />
          </div>
          {isRefreshing ? 'Sincronizando...' : 'Refrescar Biblioteca'}
        </button>
      </div>

      <AdminUploadQueue initialReplaceDocId={replaceDocId} />
      <AdminLinkImport />
      <PromotionalBannerManager />
      <CategoryManager />

      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden mt-8">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#161B22]">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            Documentos en Biblioteca
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0B0F19] border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-blue-500 w-full lg:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="text-xs text-gray-500 uppercase bg-[#0B0F19]">
              <tr>
                <th className="px-6 py-4 font-medium">Documento</th>
                <th className="px-6 py-4 font-medium">Fuente</th>
                <th className="px-6 py-4 font-medium">Páginas</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {filteredDocuments.map((doc) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    key={doc.id} 
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={doc.coverUrl} alt={doc.title} className="w-10 h-14 object-cover rounded shadow-sm" />
                      <div>
                        <div className="font-medium text-white">{doc.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{doc.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-white/10 px-2 py-1 rounded-md text-xs">{traducirSource(doc.sourceType)}</span>
                  </td>
                  <td className="px-6 py-4">{doc.pageCount}</td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${doc.status === 'ready' ? 'text-emerald-400' : 'text-blue-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${doc.status === 'ready' ? 'bg-emerald-400' : 'bg-blue-400'} ${doc.status === 'ready' ? '' : 'animate-pulse'}`}></span>
                      {doc.status === 'ready' ? 'Publicado' : 'Procesando / No Publicado'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button 
                         onClick={() => {
                           setReplaceDocId(undefined);
                           setTimeout(() => setReplaceDocId(doc.id), 10);
                         }}
                         title={`Reemplazar PDF de ${doc.title}`}
                         className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                       >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                       <button 
                         onClick={() => setEditingDoc(doc)}
                         className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                       >
                        <Edit className="w-4 h-4" />
                      </button>
                      <DeleteButton 
                        onDelete={() => removeDocument(doc.id)} 
                        docTitle={doc.title}
                      />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      </div>

      {editingDoc && (
        <AdminEditModal 
          document={editingDoc} 
          onClose={() => setEditingDoc(null)} 
        />
      )}
    </div>
  );
}
