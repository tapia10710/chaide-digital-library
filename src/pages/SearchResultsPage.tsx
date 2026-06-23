import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Search, X, Filter, ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getPdfProxyUrl, detectViewerSource } from '../lib/viewerUtils';
import { getCachedPdfData, setCachedPdfData } from '../lib/backgroundIndexer';
import { isStaticSite, staticDataUrl } from '../lib/runtimeConfig';

// pdfjs is heavy and only needed for the rare client-side fallback indexing
// path (the main search runs server-side via /api/search). Load it lazily so
// the search page bundle stays small.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      if (!lib.GlobalWorkerOptions.workerSrc) {
        lib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
      }
      return lib;
    });
  }
  return pdfjsPromise;
}

interface CatalogSearchPage {
  pageNumber: number;
  text: string;
  normalizedText: string;
}

interface CatalogSearchIndex {
  catalogId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  pdfUrl?: string;
  totalPages?: number;
  pages: CatalogSearchPage[];
}

interface GlobalSearchResult {
  catalogId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  totalPages?: number;
  pageNumber: number | null;
  snippet: string;
  matchText: string;
  source: "pdf-content" | "catalog-title" | "catalog-description";
}

const indexCache: Record<string, CatalogSearchIndex> = {};

// We can put search highlighter here
function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <span>{text}</span>;
  
  // Normalize highlight for case-insensitive search
  const normalizedHighlight = highlight.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  const matchIndex = normalizedText.indexOf(normalizedHighlight);
  if (matchIndex === -1) return <span>{text}</span>;

  const start = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + highlight.length);
  const end = text.slice(matchIndex + highlight.length);

  return (
    <span>
      {start}
      <mark className="bg-yellow-200 text-black font-semibold px-1 rounded">{match}</mark>
      {end}
    </span>
  );
}

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  
  const { documents, fetchDocuments, isLoadingDocs, searchQuery, setSearchQuery } = useStore();
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState({ current: 0, total: 0 });

  // Keep local input state synchronized with query param
  const [inputValue, setInputValue] = useState(query);

  useEffect(() => {
    setInputValue(query);
    setSearchQuery(query); // Sync global search query state
  }, [query, setSearchQuery]);

  useEffect(() => {
    if (documents && documents.length === 0 && !isLoadingDocs) {
      fetchDocuments();
    }
  }, [documents, isLoadingDocs, fetchDocuments]);

  const normalizeText = (value: string) => {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const createSnippet = (originalText: string, normalizedText: string, normalizedQuery: string, matchIndex: number) => {
    const CONTEXT_CHARS = 90;
    const start = Math.max(0, matchIndex - CONTEXT_CHARS);
    const end = Math.min(originalText.length, matchIndex + normalizedQuery.length + CONTEXT_CHARS);
    
    let snippet = originalText.slice(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < originalText.length) snippet = snippet + '...';
    return snippet;
  };

  const indexPdf = async (doc: any): Promise<CatalogSearchIndex | null> => {
    if (indexCache[doc.id]) return indexCache[doc.id];

    // 1. Check IndexedDB Cache first
    try {
      const cached = await getCachedPdfData(doc.id);
      if (cached) {
        if (cached.failed) {
            console.log(`[Search] Retrying ${doc.title} after previous index failure: ${cached.error}`);
        }

        if (cached.fullText && cached.fullText.length > 0) {
          console.log(`[Search] Found cached index for ${doc.title}`);
          const index: CatalogSearchIndex = {
            catalogId: doc.id,
            title: doc.title,
            description: doc.description,
            coverUrl: doc.coverUrl,
            totalPages: cached.fullText.length,
            pages: cached.fullText.map(it => ({
              pageNumber: it.page,
              text: it.text,
              normalizedText: normalizeText(it.text)
            }))
          };
          indexCache[doc.id] = index;
          return index;
        }
      }
    } catch (cacheErr) {
      console.warn('Cache read error:', cacheErr);
    }

    if (isStaticSite) {
      try {
        const response = await fetch(staticDataUrl(`search-index/${encodeURIComponent(doc.id)}.json`));
        if (!response.ok) return null;
        const persisted = await response.json();
        const pages = Array.isArray(persisted.pages) ? persisted.pages : [];
        const index: CatalogSearchIndex = {
          catalogId: doc.id,
          title: doc.title,
          description: doc.description,
          coverUrl: doc.coverUrl,
          pdfUrl: doc.fileUrl,
          totalPages: pages.length,
          pages: pages.map((page: { pageNumber: number; text: string }) => ({
            pageNumber: page.pageNumber,
            text: page.text,
            normalizedText: normalizeText(page.text),
          })),
        };
        indexCache[doc.id] = index;
        return index;
      } catch {
        return null;
      }
    }

    // 2. Perform on-the-fly indexing if not cached
    const source = detectViewerSource(doc.fileUrl || '');
    if (source.type !== 'pdf-url') return null;

    try {
      const proxiedUrl = getPdfProxyUrl(source.value);
      const absoluteUrl = proxiedUrl.startsWith('/') ? window.location.origin + proxiedUrl : proxiedUrl;
      const encodedUrl = encodeURI(absoluteUrl);
      const pdfjsLib = await loadPdfjs();
      const loadingTask = pdfjsLib.getDocument(encodedUrl);
      const pdf = await loadingTask.promise;
      
      const pages: CatalogSearchPage[] = [];
      const cachedFullText: { page: number, text: string }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item: any) => item.str || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        
        pages.push({
          pageNumber: i,
          text,
          normalizedText: normalizeText(text)
        });

        cachedFullText.push({ page: i, text });
      }

      const index: CatalogSearchIndex = {
        catalogId: doc.id,
        title: doc.title,
        description: doc.description,
        coverUrl: doc.coverUrl,
        pdfUrl: source.value,
        totalPages: pdf.numPages,
        pages
      };

      // Save to cache for next time
      await setCachedPdfData(doc.id, {
        items: [], // Outline not needed for this search index, or can be empty
        fullText: cachedFullText,
        lastIndexed: new Date().toISOString()
      });

      indexCache[doc.id] = index;
      return index;
    } catch (e: any) {
      console.warn(`Error indexing PDF for ${doc.title}:`, e.message);
      // Fail gracefully: if a PDF is invalid or missing, we just return null so it's skipped in search
      return null;
    }
  };

  const performSearch = useCallback(async () => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery || documents.length === 0) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const searchResults: GlobalSearchResult[] = [];

    if (!isStaticSite) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.results)) {
            setIndexingProgress({ current: data.totalPdf || 0, total: data.totalPdf || 0 });
            setResults(data.results as GlobalSearchResult[]);
            setIsSearching(false);
            return;
          }
        }
      } catch (serverSearchError) {
        console.warn('Server search failed, using browser fallback:', serverSearchError);
      }
    }

    // 1. Initial Quick Search (Title/Description)
    documents.forEach(doc => {
      const normTitle = normalizeText(doc.title);
      const normDesc = normalizeText(doc.description || '');

      if (normTitle.includes(normalizedQuery)) {
        searchResults.push({
          catalogId: doc.id,
          title: doc.title,
          description: doc.description,
          coverUrl: doc.coverUrl,
          totalPages: doc.pageCount,
          pageNumber: 1,
          snippet: doc.title,
          matchText: query,
          source: 'catalog-title'
        });
      } else if (normDesc.includes(normalizedQuery)) {
        searchResults.push({
          catalogId: doc.id,
          title: doc.title,
          description: doc.description,
          coverUrl: doc.coverUrl,
          totalPages: doc.pageCount,
          pageNumber: 1,
          snippet: doc.description || '',
          matchText: query,
          source: 'catalog-description'
        });
      }
    });

    const pdfDocs = documents.filter(doc => detectViewerSource(doc.fileUrl || '').type === 'pdf-url');
    const totalPdf = pdfDocs.length;
    setIndexingProgress({ current: 0, total: totalPdf });

    // 2. Initial Parallel Cache Check
    const cachedIndexes = await Promise.all(pdfDocs.map(async doc => {
      if (indexCache[doc.id]) return { doc, index: indexCache[doc.id] };
      const cached = await getCachedPdfData(doc.id);
      if (cached && cached.fullText && cached.fullText.length > 0) {
        const index: CatalogSearchIndex = {
          catalogId: doc.id,
          title: doc.title,
          description: doc.description,
          coverUrl: doc.coverUrl,
          totalPages: cached.fullText.length,
          pages: cached.fullText.map(it => ({
            pageNumber: it.page,
            text: it.text,
            normalizedText: normalizeText(it.text)
          }))
        };
        indexCache[doc.id] = index;
        return { doc, index };
      }
      return { doc, index: null };
    }));

    // Process cached matches immediately
    cachedIndexes.forEach(({ doc, index }) => {
      if (index) {
        for (const page of index.pages) {
          const matchIdx = page.normalizedText.indexOf(normalizedQuery);
          if (matchIdx !== -1) {
            searchResults.push({
              catalogId: doc.id,
              title: doc.title,
              description: doc.description,
              coverUrl: doc.coverUrl,
              totalPages: index.totalPages,
              pageNumber: page.pageNumber,
              snippet: createSnippet(page.text, page.normalizedText, normalizedQuery, matchIdx),
              matchText: query,
              source: 'pdf-content'
            });
          }
        }
      }
    });

    setResults([...searchResults].sort((a, b) => {
      if (a.source !== 'pdf-content' && b.source === 'pdf-content') return -1;
      if (a.source === 'pdf-content' && b.source !== 'pdf-content') return 1;
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    }));

    // 3. Fallback: On-the-fly Indexing for missing ones
    const missingDocs = cachedIndexes.filter(it => !it.index).map(it => it.doc);
    
    if (missingDocs.length > 0) {
      for (let i = 0; i < missingDocs.length; i++) {
        const doc = missingDocs[i];
        setIndexingProgress({ current: totalPdf - missingDocs.length + i + 1, total: totalPdf });
        
        const index = await indexPdf(doc);
        if (index) {
          let foundNewMatches = false;
          for (const page of index.pages) {
            const matchIdx = page.normalizedText.indexOf(normalizedQuery);
            if (matchIdx !== -1) {
              searchResults.push({
                catalogId: doc.id,
                title: doc.title,
                description: doc.description,
                coverUrl: doc.coverUrl,
                totalPages: index.totalPages,
                pageNumber: page.pageNumber,
                snippet: createSnippet(page.text, page.normalizedText, normalizedQuery, matchIdx),
                matchText: query,
                source: 'pdf-content'
              });
              foundNewMatches = true;
            }
          }
          
          if (foundNewMatches) {
            setResults([...searchResults].sort((a, b) => {
              if (a.source !== 'pdf-content' && b.source === 'pdf-content') return -1;
              if (a.source === 'pdf-content' && b.source !== 'pdf-content') return 1;
              return (a.pageNumber || 0) - (b.pageNumber || 0);
            }));
          }
        }
      }
    }

    searchResults.sort((a, b) => {
      if (a.source !== 'pdf-content' && b.source === 'pdf-content') return -1;
      if (a.source === 'pdf-content' && b.source !== 'pdf-content') return 1;
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });

    setResults(searchResults);
    setIsSearching(false);
  }, [query, documents]);

  useEffect(() => {
    if (documents && documents.length > 0) {
      performSearch();
    }
  }, [performSearch, documents]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() });
    }
  };

  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
  };

  return (
    <main className="min-h-screen pt-24 pb-20 px-4 md:px-8 bg-white" style={{ color: '#111', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", sans-serif' }}>
      <div className="max-w-[1000px] mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => navigate('/')}
              className="text-[#111] hover:text-black transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-3xl font-bold tracking-tight">Páginas encontradas</h1>
          </div>
          <div className="text-gray-500 ml-9 flex gap-2 text-sm">
            <span>{results.length} resultados en el documento</span>
            <span>•</span>
            <span>Total de catálogos buscados</span>
          </div>
        </header>

        {/* Search Bar matching the reference image */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center">
            <div className="absolute left-4 text-gray-500 pointer-events-none">
              <Search className="w-5 h-5" />
            </div>
            <input 
              type="text" 
              className="w-full h-14 pl-12 pr-12 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg"
              placeholder="Buscar catálogos..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            {inputValue && (
              <button 
                type="button"
                onClick={handleClear}
                className="absolute right-4 w-6 h-6 bg-gray-400 hover:bg-gray-500 text-white rounded-full flex items-center justify-center transition-colors"
                aria-label="Borrar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
          <button className="h-14 px-6 flex items-center gap-2 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors shrink-0">
            <Filter className="w-5 h-5" />
            <span>Filtros</span>
          </button>
        </div>

        {isSearching && (
          <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-[#111] animate-spin" />
            <div>
              <p className="text-lg font-medium">Buscando...</p>
              <p className="text-sm text-[#111]/50 mt-1">
                Indexando catálogos: {indexingProgress.current} de {indexingProgress.total}
              </p>
            </div>
          </div>
        )}

        {!isSearching && results.length === 0 && query && (
          <div className="py-20 text-center flex flex-col items-center gap-4 border border-dashed border-[#111]/10 rounded-2xl bg-gray-50">
            <AlertCircle className="w-12 h-12 text-[#111]/20" />
            <p className="text-xl text-[#111]/50">No se encontraron resultados para “{query}”</p>
          </div>
        )}

        {/* Results List */}
        {!isSearching && results.length > 0 && (
          <div className="flex flex-col border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-200 bg-white shadow-sm mb-8">
            {results.map((result, idx) => (
              <div 
                key={`${result.catalogId}-${result.pageNumber}-${idx}`}
                className="flex flex-col sm:flex-row gap-6 p-6 hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => navigate(`/viewer/${result.catalogId}?page=${result.pageNumber || 1}&search=${encodeURIComponent(query)}`)}
              >
                <div className="w-full sm:w-48 h-32 flex-shrink-0 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center">
                  <img src={result.coverUrl || '/placeholder.jpg'} alt={result.title} className="w-full h-full object-contain" />
                </div>
                
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {result.source === 'pdf-content' ? `Página ${result.pageNumber}` : 'Catálogo'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{result.title}</p>
                  
                  <p className="text-gray-700 leading-relaxed max-w-3xl">
                    <HighlightedText text={result.snippet} highlight={query} />
                  </p>
                  
                  <div className="mt-4 flex gap-2">
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg font-medium">
                      Resultados
                    </span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center justify-center">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 group-hover:border-black group-hover:text-black transition-colors">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))}
            
            {/* Footer Pagination */}
            <div className="p-4 bg-gray-50 flex items-center justify-between text-sm text-gray-600">
              <div>
                1-{results.length} de {results.length} resultados
              </div>
              <div className="flex gap-2">
                <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded border border-black bg-black text-white font-medium">
                  1
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" disabled>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
