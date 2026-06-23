import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Search as SearchIcon, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  X, 
  FileWarning, 
  Home, 
  ArrowLeft, 
  Menu,
  ChevronUp, 
  ChevronDown, 
  List as ListIcon, 
  LayoutGrid
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';
import { formatFileSize, sortPdfDocumentsFirst } from '../../lib/viewerUtils';
import { getCachedPdfData } from '../../lib/backgroundIndexer';
import { buildIndexFromPdfDocument } from '../../lib/pdfIndexerService';
import {
  loadDocument,
  getCachedDocument,
  getRenderedBitmap,
  setRenderedBitmap,
} from '../../lib/pdfCache';
import CatalogPreviewCard from '../library/CatalogPreviewCard';
import CatalogViewerDetails from './CatalogViewerDetails';

// ... (previous imports and Page component remain same)

// Configure PDF.js worker - Use matching version
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SearchMatch {
  id: string;
  pageNumber: number;
  text: string;
  rects: HighlightRect[];
}

interface PdfIndexItem {
  id: string;
  title: string;
  pageNumber: number;
  level: number;
  source: "outline" | "auto" | "ocr";
  children?: PdfIndexItem[];
}

type IndexBuildResult = {
  status: "ready" | "empty" | "no-text" | "loading" | "error";
  items: PdfIndexItem[];
  source: "outline" | "auto" | "ocr" | null;
};

interface ProfessionalFlipbookProps {
  documentId: string;
  url: string;
  title: string;
  onClose?: () => void;
  downloadUrl?: string;
  initialPage?: number;
  initialSearch?: string;
}

const SEARCH_FOCUS_ZOOM = 1.25;

// Global render concurrency limiter for BACKGROUND pages. The aggressive
// full-document loader can make dozens of pages want to rasterize at once;
// without a cap they cancel each other and some end up blank. Visible/priority
// pages bypass this and render immediately; background pages queue here so a
// few render at a time and every one completes reliably.
const MAX_CONCURRENT_RENDERS = 3;
let activeRenderCount = 0;
const renderWaiters: Array<() => void> = [];
function acquireRenderSlot(): Promise<void> {
  if (activeRenderCount < MAX_CONCURRENT_RENDERS) {
    activeRenderCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => renderWaiters.push(resolve));
}
function releaseRenderSlot() {
  const next = renderWaiters.shift();
  if (next) {
    next(); // hand the slot directly to the next waiter (count unchanged)
  } else {
    activeRenderCount = Math.max(0, activeRenderCount - 1);
  }
}

// Robust Page Component
const PdfPage = React.forwardRef<HTMLDivElement, {
  number: number, 
  width: number, 
  height: number, 
  pdf: pdfjsLib.PDFDocumentProxy | null,
  highlights?: { rect: HighlightRect, isActive: boolean }[],
  isActiveMatchPage?: boolean,
  zoom: number,
  currentPage: number,
  backgroundRenderedPages?: Set<number>,
  docUrl?: string
}>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);
  const lastRenderScaleRef = useRef<number>(0);
  const isRenderingRef = useRef(false);
  // Bumped by the self-healing verifier to force a re-fetch / re-render of a
  // page that should be loaded but isn't yet (e.g. starved under heavy load).
  const [renderAttempt, setRenderAttempt] = useState(0);

  // A page is "active" (should be fetched + rendered) when it's in the visible
  // window OR once the aggressive full-document loader has unlocked it. Pages
  // are NEVER evicted: once rendered they stay loaded, so the whole document
  // ends up cached in memory for instant navigation (speed over memory).
  const WINDOW_BEHIND = 2;
  const WINDOW_AHEAD = 4;
  const inWindow =
    props.number <= 2 ||
    (props.number >= props.currentPage - WINDOW_BEHIND &&
      props.number <= props.currentPage + WINDOW_AHEAD);
  const isUnlocked = !!(props.backgroundRenderedPages && props.backgroundRenderedPages.has(props.number));
  const active = inWindow || isUnlocked;

  const [page, setPage] = useState<any>(null);

  // Fetch the page object (and its byte ranges, via pdf.js) once it becomes
  // active — this is the per-page, on-demand loading that then snowballs into
  // loading the whole document.
  useEffect(() => {
    if (!active || !props.pdf || page) return;

    let isCurrent = true;
    props.pdf.getPage(props.number).then((p: any) => {
      if (isCurrent) setPage(p);
    }).catch(err => console.warn(`Error getting page ${props.number}:`, err));

    return () => { isCurrent = false; };
  }, [active, props.pdf, props.number, page, renderAttempt]);

  // Self-healing verifier: while a page is active but still hasn't painted,
  // keep retrying (re-fetch + re-render) until it does. This guarantees no page
  // stays blank — if a render was starved or stalled under load, it is redone.
  useEffect(() => {
    if (!active || rendered) return;
    const id = window.setInterval(() => {
      if (!isRenderingRef.current && !rendered) {
        setRenderAttempt((a) => a + 1);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [active, rendered]);

  // Instant paint from the persistent bitmap cache: if this exact page was
  // already rendered before (even in a previous viewing session of the same
  // catalog), draw the cached bitmap immediately so there is no spinner/flash.
  useLayoutEffect(() => {
    if (rendered || !props.docUrl || !canvasRef.current) return;
    const cached = getRenderedBitmap(props.docUrl, props.number);
    if (!cached) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = cached.w;
    canvas.height = cached.h;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';
    try {
      ctx.drawImage(cached.bitmap, 0, 0);
      setRendered(true);
    } catch { /* fall back to normal render */ }
  }, [props.docUrl, props.number, rendered]);

  useEffect(() => {
    if (!active || !page || !canvasRef.current || props.width <= 0 || props.height <= 0) return;

    let isCurrent = true;

    // Visible/near pages render sharp and immediately; background pages render
    // lighter and go through the concurrency limiter so they never flood.
    const isPriorityPage =
      props.number === props.currentPage ||
      props.number === props.currentPage + 1 ||
      props.number === props.currentPage - 1 ||
      props.number === props.currentPage + 2 ||
      props.number <= 2;

    const render = async () => {
      const useLimiter = !isPriorityPage;
      if (useLimiter) await acquireRenderSlot();
      try {
        if (!isCurrent || !canvasRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });

        // Cap DPR at 2 to keep memory in check on high-density screens.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scaleByWidth = props.width / baseViewport.width;
        const scaleByHeight = props.height / baseViewport.height;
        const fitScale = Math.min(scaleByWidth, scaleByHeight);

        const zoomFactor = isPriorityPage ? Math.max(props.zoom, 1) : 1;
        const MAX_RENDER_SCALE = isPriorityPage ? 3.0 : 1.5;
        const renderScale = Math.min(fitScale * dpr * zoomFactor, MAX_RENDER_SCALE);

        // Skip redundant re-renders: same scale + already painted -> nothing to do.
        if (rendered && Math.abs(lastRenderScaleRef.current - renderScale) < 0.001) {
          return;
        }

        const viewport = page.getViewport({ scale: renderScale });
        if (!canvasRef.current || !isCurrent) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!context || !isCurrent) return;

        context.imageSmoothingEnabled = true;
        (context as any).imageSmoothingQuality = 'high';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* noop */ }
        }

        renderTaskRef.current = page.render({ canvasContext: context, viewport });
        isRenderingRef.current = true;
        await renderTaskRef.current.promise;
        renderTaskRef.current = null;

        if (isCurrent) {
          lastRenderScaleRef.current = renderScale;
          setRendered(true);
          // Persist the rendered bitmap so returning to this page (even after
          // leaving the viewer) repaints instantly from cache.
          if (props.docUrl && typeof createImageBitmap === 'function') {
            const w = canvas.width;
            const h = canvas.height;
            const docUrl = props.docUrl;
            const pageNum = props.number;
            createImageBitmap(canvas)
              .then((bmp) => setRenderedBitmap(docUrl, pageNum, bmp, w, h))
              .catch(() => undefined);
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      } finally {
        isRenderingRef.current = false;
        if (useLimiter) releaseRenderSlot();
      }
    };

    // First paint: render immediately. Subsequent re-renders (e.g. while the
    // user pinches/zooms) are debounced — the parent already CSS-scales the page
    // for instant visual feedback, so we only need to re-rasterize for crispness
    // once the gesture settles. This avoids a re-render storm during zoom.
    let debounceTimer: number | null = null;
    if (!rendered) {
      render();
    } else {
      debounceTimer = window.setTimeout(render, 160);
    }

    return () => {
      isCurrent = false;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [page, active, props.width, props.height, props.zoom, props.currentPage, renderAttempt]);

  return (
    <div
      className="bg-white shadow-lg overflow-hidden flex items-center justify-center relative page-container border-r border-gray-100 last:border-none" 
      ref={ref} 
      data-density={props.number === 1 ? "hard" : "soft"}
    >
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50">
          <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      
      <div className="relative w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} className="pdf-page-canvas" />
        
        {/* Highlight Layer */}
        {rendered && props.highlights && props.highlights.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            <div className="relative w-full h-full">
              {props.highlights.map((h, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "absolute transition-all duration-300 rounded-sm",
                    h.isActive 
                      ? "bg-orange-400/60 ring-2 ring-orange-500 ring-offset-1 z-20 scale-105" 
                      : "bg-yellow-400/40 border border-yellow-600/30 z-10"
                  )}
                  style={{
                    left: `${h.rect.left}%`,
                    top: `${h.rect.top}%`,
                    width: `${h.rect.width}%`,
                    height: `${h.rect.height}%`
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 right-6 text-[10px] font-medium text-gray-300 select-none z-20">
        {props.number}
      </div>
    </div>
  );
});

type PageActivationJob = {
  id: string;
  cancelled: boolean;
  activate: () => void;
};

const pageActivationQueue: PageActivationJob[] = [];
const queuedPageActivations = new Set<string>();
let pageActivationTimer: number | null = null;

function flushPageActivationQueue() {
  pageActivationTimer = null;
  let activated = 0;

  while (pageActivationQueue.length > 0 && activated < 2) {
    const job = pageActivationQueue.shift()!;
    queuedPageActivations.delete(job.id);
    if (job.cancelled) continue;
    job.activate();
    activated++;
  }

  if (pageActivationQueue.length > 0) {
    pageActivationTimer = window.setTimeout(flushPageActivationQueue, 90);
  }
}

function enqueuePageActivation(id: string, activate: () => void) {
  if (queuedPageActivations.has(id)) return () => undefined;

  const job: PageActivationJob = { id, cancelled: false, activate };
  queuedPageActivations.add(id);
  pageActivationQueue.push(job);

  if (pageActivationTimer === null) {
    pageActivationTimer = window.setTimeout(flushPageActivationQueue, 60);
  }

  return () => {
    job.cancelled = true;
    queuedPageActivations.delete(id);
  };
}

type QueuedPdfPageElement = HTMLDivElement & {
  ensurePdfPage?: () => void;
};

type QueuedPdfPageProps = {
  number: number;
  width: number;
  height: number;
  pdf: pdfjsLib.PDFDocumentProxy | null;
  highlights?: { rect: HighlightRect; isActive: boolean }[];
  isActiveMatchPage?: boolean;
  zoom: number;
  eager: boolean;
  priority: boolean;
  loadAll: boolean;
  docUrl?: string;
};

const QueuedPdfPageBase = React.forwardRef<HTMLDivElement, QueuedPdfPageProps>((props, ref) => {
  const rootRef = useRef<QueuedPdfPageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const lastRenderScaleRef = useRef(0);
  const isRenderingRef = useRef(false);
  const renderedRef = useRef(false);
  const [queuedActive, setQueuedActive] = useState(props.eager);
  const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null);
  const [rendered, setRendered] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const active = props.eager || queuedActive;

  const setRootNode = useCallback((node: QueuedPdfPageElement | null) => {
    rootRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }, [ref]);

  useEffect(() => {
    renderedRef.current = rendered;
    if (rootRef.current) {
      rootRef.current.dataset.pdfRendered = rendered ? 'true' : 'false';
    }
  }, [rendered]);

  useEffect(() => {
    if (props.eager) setQueuedActive(true);
  }, [props.eager]);

  useEffect(() => {
    if (!props.loadAll || props.eager || queuedActive || !props.docUrl) return;
    return enqueuePageActivation(
      `${props.docUrl}:${props.number}`,
      () => setQueuedActive(true),
    );
  }, [props.docUrl, props.eager, props.loadAll, props.number, queuedActive]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    node.ensurePdfPage = () => {
      if (renderedRef.current || isRenderingRef.current) return;
      setQueuedActive(true);
      setRenderAttempt((attempt) => attempt + 1);
    };

    return () => {
      delete node.ensurePdfPage;
    };
  }, []);

  useEffect(() => {
    if (!active || !props.pdf || page) return;

    let current = true;
    props.pdf.getPage(props.number)
      .then((pdfPage) => {
        if (current) setPage(pdfPage);
      })
      .catch((error) => {
        console.warn(`Error getting page ${props.number}:`, error);
      });

    return () => {
      current = false;
    };
  }, [active, page, props.number, props.pdf, renderAttempt]);

  useLayoutEffect(() => {
    if (rendered || !props.docUrl || !canvasRef.current) return;
    const cached = getRenderedBitmap(props.docUrl, props.number);
    if (!cached) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = cached.w;
    canvasRef.current.height = cached.h;
    canvasRef.current.style.width = '100%';
    canvasRef.current.style.height = '100%';
    canvasRef.current.style.objectFit = 'contain';

    try {
      context.drawImage(cached.bitmap, 0, 0);
      setRendered(true);
    } catch {
      // The bitmap may have been evicted between lookup and paint.
    }
  }, [props.docUrl, props.number, rendered]);

  useEffect(() => {
    if (!active || !page || !canvasRef.current || props.width <= 0 || props.height <= 0) return;

    let current = true;
    let debounceTimer: number | null = null;

    const render = async () => {
      const useLimiter = !props.priority;
      if (useLimiter) await acquireRenderSlot();

      try {
        if (!current || !canvasRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fitScale = Math.min(
          props.width / baseViewport.width,
          props.height / baseViewport.height,
        );
        const renderScale = Math.min(
          fitScale * dpr * (props.priority ? Math.max(props.zoom, 1) : 1),
          props.priority ? 3 : 1.35,
        );

        if (rendered && Math.abs(lastRenderScaleRef.current - renderScale) < 0.001) return;

        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!context || !current) return;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        renderTaskRef.current?.cancel?.();
        renderTaskRef.current = page.render({ canvasContext: context, viewport });
        isRenderingRef.current = true;
        await renderTaskRef.current.promise;
        renderTaskRef.current = null;

        if (!current) return;

        lastRenderScaleRef.current = renderScale;
        setRendered(true);

        if (props.docUrl && typeof createImageBitmap === 'function') {
          const width = canvas.width;
          const height = canvas.height;
          void createImageBitmap(canvas)
            .then((bitmap) => setRenderedBitmap(props.docUrl!, props.number, bitmap, width, height))
            .catch(() => undefined);
        }
      } catch (error: any) {
        if (error?.name !== 'RenderingCancelledException') {
          console.error(`Page ${props.number} render error:`, error);
        }
      } finally {
        isRenderingRef.current = false;
        if (useLimiter) releaseRenderSlot();
      }
    };

    if (rendered) {
      debounceTimer = window.setTimeout(render, 140);
    } else {
      void render();
    }

    return () => {
      current = false;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      renderTaskRef.current?.cancel?.();
    };
  }, [
    active,
    page,
    props.docUrl,
    props.height,
    props.number,
    props.priority,
    props.width,
    props.zoom,
    renderAttempt,
    rendered,
  ]);

  return (
    <div
      ref={setRootNode}
      className="bg-white shadow-lg overflow-hidden flex items-center justify-center relative page-container border-r border-gray-100 last:border-none"
      data-density={props.number === 1 ? 'hard' : 'soft'}
      data-pdf-page={props.number}
      data-pdf-rendered={rendered ? 'true' : 'false'}
    >
      {!rendered ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50">
          <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : null}

      <div className="relative w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} className="pdf-page-canvas" />

        {rendered && props.highlights && props.highlights.length > 0 ? (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            <div className="relative w-full h-full">
              {props.highlights.map((highlight, index) => (
                <div
                  key={index}
                  className={cn(
                    'absolute transition-all duration-300 rounded-sm',
                    highlight.isActive
                      ? 'bg-orange-400/60 ring-2 ring-orange-500 ring-offset-1 z-20 scale-105'
                      : 'bg-yellow-400/40 border border-yellow-600/30 z-10',
                  )}
                  style={{
                    left: `${highlight.rect.left}%`,
                    top: `${highlight.rect.top}%`,
                    width: `${highlight.rect.width}%`,
                    height: `${highlight.rect.height}%`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="absolute bottom-4 right-6 text-[10px] font-medium text-gray-300 select-none z-20">
        {props.number}
      </div>
    </div>
  );
});

const QueuedPdfPage = React.memo(QueuedPdfPageBase, (previous, next) => {
  const previousHighlights = previous.highlights || [];
  const nextHighlights = next.highlights || [];
  const highlightsUnchanged =
    previousHighlights === nextHighlights ||
    (previousHighlights.length === 0 && nextHighlights.length === 0);

  return (
    previous.number === next.number &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.pdf === next.pdf &&
    previous.zoom === next.zoom &&
    previous.eager === next.eager &&
    previous.priority === next.priority &&
    previous.loadAll === next.loadAll &&
    previous.docUrl === next.docUrl &&
    previous.isActiveMatchPage === next.isActiveMatchPage &&
    highlightsUnchanged
  );
});

// THUMBNAIL COMPONENT (Optimized with cache support)
interface ThumbnailProps {
  pdf: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  cache: Map<number, string>;
  onThumbnailRendered?: (pageNumber: number, dataUrl: string) => void;
}

const PdfPageThumbnail = ({ pdf, pageNumber, cache, onThumbnailRendered }: ThumbnailProps) => {
  const cachedImg = cache.get(pageNumber);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (cachedImg || !pdf || !canvasRef.current) return;
    
    let isCurrent = true;
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.15 });
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
        
        if (isCurrent) {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          onThumbnailRendered?.(pageNumber, dataUrl);
        }
      } catch (err) { }
    };
    render();
    return () => { isCurrent = false; };
  }, [pdf, pageNumber, cachedImg, onThumbnailRendered]);

  if (cachedImg) {
    return <img src={cachedImg} alt={`Página ${pageNumber}`} className="w-full h-full object-contain" />;
  }
  return <canvas ref={canvasRef} className="pdf-thumbnail-canvas w-full h-full object-contain" />;
};

const LazyPdfPageThumbnail = ({ pdf, pageNumber, cache, onThumbnailRendered }: ThumbnailProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isCached = cache.has(pageNumber);

  useEffect(() => {
    if (isCached) {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isCached]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-50 overflow-hidden">
      {isVisible || isCached ? (
        <PdfPageThumbnail 
          pdf={pdf} 
          pageNumber={pageNumber} 
          cache={cache} 
          onThumbnailRendered={onThumbnailRendered}
        />
      ) : (
        <div className="w-4 h-4 border-2 border-gray-100 border-t-blue-500 rounded-full animate-spin" />
      )}
    </div>
  );
};

export default function ProfessionalFlipbook({ documentId, url, title, onClose, downloadUrl, initialPage, initialSearch }: ProfessionalFlipbookProps) {
  const navigate = useNavigate();
  const { documents } = useStore();
  const currentDoc = useMemo(() => {
    return documents.find((document) => document.id === documentId);
  }, [documentId, documents]);

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [docCacheKey, setDocCacheKey] = useState<string>('');
  const [numPages, setNumPages] = useState(0);
  const [pdfPageSize, setPdfPageSize] = useState({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(0); // 0-based for flipbook
  const [loadProgress, setLoadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readyToRender, setReadyToRender] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState({ x: '50%', y: '50%' });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // NOTE: The eager full-document thumbnail preloader was removed. Thumbnails
  // are now rendered lazily on demand by LazyPdfPageThumbnail (IntersectionObserver)
  // only when the thumbnail panel is opened, avoiding a second full render pass.

  const [containerSize, setContainerSize] = useState({
    width: 0, 
    height: 0 
  });
  
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const activePointers = useRef<Map<number, { x: number, y: number, time: number }>>(new Map());
  const lastTapRef = useRef<{ x: number, y: number, time: number } | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const isSwipingRef = useRef(false);
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const lastPanRef = useRef({ x: 0, y: 0 });
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef(1);

  const DOUBLE_TAP_MAX_DELAY = 330;
  const DOUBLE_TAP_MAX_DISTANCE = 48;
  const TAP_MAX_MOVEMENT = 30;
  const SWIPE_MIN_DISTANCE = 45;
  const SWIPE_MAX_VERTICAL_DRIFT = 35;
  const EDGE_ZONE_RATIO = 0.2;
  const MAX_ZOOM = 2.5;
  const MIN_ZOOM = 1;
  const DOUBLE_TAP_ZOOM = 1.8;

  const isInteractiveElement = (target: any) => {
    return !!target?.closest('button, input, a, [role="button"], .pdf-toolbar, .pdf-search-panel');
  };

  const getTapZone = (clientX: number) => {
    if (!mainAreaRef.current) return 'center';
    const rect = mainAreaRef.current.getBoundingClientRect();
    const relativeX = (clientX - rect.left) / rect.width;
    if (relativeX < EDGE_ZONE_RATIO) return 'left';
    if (relativeX > 1 - EDGE_ZONE_RATIO) return 'right';
    return 'center';
  };

  const clearPendingSingleTap = () => {
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isInteractiveElement(e.target)) return;
    
    activePointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      time: Date.now()
    });

    if (activePointers.current.size === 1) {
      if (isMobile && isIndexOpen) {
        setIsIndexOpen(false);
      }
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      isPanningRef.current = false;
      isSwipingRef.current = false;
    } else if (activePointers.current.size === 2) {
      clearPendingSingleTap();
      const docs = Array.from(activePointers.current.values()) as { x: number, y: number }[];
      if (docs.length < 2) return;
      initialTouchDistanceRef.current = Math.hypot(docs[0].x - docs[1].x, docs[0].y - docs[1].y);
      initialZoomRef.current = zoom;
      
      if (zoom <= 1.01) {
        const cx = (docs[0].x + docs[1].x) / 2;
        const cy = (docs[0].y + docs[1].y) / 2;
        const containerElement = e.currentTarget as HTMLElement;
        const spreadElement = containerElement.querySelector('.pdf-book-spread') as HTMLElement;
        const rect = spreadElement ? spreadElement.getBoundingClientRect() : containerElement.getBoundingClientRect();
        
        const originX = Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100));
        const originY = Math.max(0, Math.min(100, ((cy - rect.top) / rect.height) * 100));
        setZoomOrigin({ x: `${originX}%`, y: `${originY}%` });
      }
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = activePointers.current.get(e.pointerId);
    if (!start) return;

    // Update current position for this pointer
    activePointers.current.set(e.pointerId, {
      ...start,
      currentX: e.clientX,
      currentY: e.clientY
    });

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (activePointers.current.size === 1) {
      if (zoom > 1) {
        if (Math.abs(dx) > TAP_MAX_MOVEMENT || Math.abs(dy) > TAP_MAX_MOVEMENT) {
          if (!isPanningRef.current) {
            isPanningRef.current = true;
            setIsPanning(true);
          }
          setPan({
            x: e.clientX - startPanRef.current.x,
            y: e.clientY - startPanRef.current.y
          });
        }
      } else {
        if (Math.abs(dx) > SWIPE_MIN_DISTANCE && Math.abs(dy) < SWIPE_MAX_VERTICAL_DRIFT) {
          isSwipingRef.current = true;
        }
      }
    } else if (activePointers.current.size === 2 && initialTouchDistanceRef.current) {
      const docs = Array.from(activePointers.current.values()) as { currentX: number, currentY: number }[];
      if (docs.length < 2) return;
      const currentDistance = Math.hypot(docs[0].currentX - docs[1].currentX, docs[0].currentY - docs[1].currentY);
      const scale = currentDistance / initialTouchDistanceRef.current;
      const newZoom = Math.min(Math.max(initialZoomRef.current * scale, 1), 2.5);
      setZoom(newZoom);
      if (newZoom <= 1.01) {
        setPan({ x: 0, y: 0 });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const start = activePointers.current.get(e.pointerId);
    if (!start) return;

    activePointers.current.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    // If we drop from 2 pointers to 1 pointer, we must reset the pan starting point for the remaining pointer
    if (activePointers.current.size === 1) {
      const remainingDoc = Array.from(activePointers.current.values())[0] as { currentX: number, currentY: number };
      startPanRef.current = {
        x: remainingDoc.currentX - pan.x,
        y: remainingDoc.currentY - pan.y
      };
      // Explicitly return to skip tap/swipe logic for a pinch-ended gesture
      return;
    }

    const dx = e.clientX - start.x;
    const movement = Math.hypot(dx, e.clientY - start.y);
    const now = Date.now();

    if (isPanningRef.current) {
      if (activePointers.current.size === 0) {
        setIsPanning(false);
        isPanningRef.current = false;
      }
      return;
    }

    if (isSwipingRef.current) {
      isSwipingRef.current = false;
      if (zoom <= 1) {
        if (dx < -SWIPE_MIN_DISTANCE) {
          goToNextPage(true);
        } else if (dx > SWIPE_MIN_DISTANCE) {
          goToPreviousPage(true);
        }
      }
      return;
    }

    if (movement > TAP_MAX_MOVEMENT) return;

    // Tap Handling
    const zone = getTapZone(e.clientX);
    const isDoubleTap = 
      lastTapRef.current && 
      (now - lastTapRef.current.time) < DOUBLE_TAP_MAX_DELAY &&
      Math.hypot(e.clientX - lastTapRef.current.x, e.clientY - lastTapRef.current.y) < DOUBLE_TAP_MAX_DISTANCE;

    if (isDoubleTap) {
      clearPendingSingleTap();
      
      // Allow double tap zoom anywhere
      toggleZoomAtPoint(e.clientX, e.clientY, e.currentTarget as HTMLElement);
      lastTapRef.current = null;
      return;
    }

    lastTapRef.current = { x: e.clientX, y: e.clientY, time: now };
    clearPendingSingleTap();

    singleTapTimerRef.current = window.setTimeout(() => {
      if (zoom <= 1) {
        if (zone === 'right') {
          goToNextPage(true);
        } else if (zone === 'left') {
          goToPreviousPage(true);
        }
      }
      lastTapRef.current = null;
    }, DOUBLE_TAP_MAX_DELAY);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [highlightsVisible, setHighlightsVisible] = useState(false);
  const [fullText, setFullText] = useState<{ page: number, text: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexItems, setIndexItems] = useState<PdfIndexItem[]>([]);
  const [indexStatus, setIndexStatus] = useState<IndexBuildResult['status']>('empty');
  const [indexSource, setIndexSource] = useState<IndexBuildResult['source']>(null);
  const [expandedIndexItems, setExpandedIndexItems] = useState<Set<string>>(new Set());
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [isThumbnailPanelOpen, setIsThumbnailPanelOpen] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Map<number, string>>(new Map());
  const [pageInput, setPageInput] = useState('1');
  const [loadAll, setLoadAll] = useState(false);

  // This switch changes once per document. Individual pages then enter the
  // module-level queue without updating the parent or destabilizing page-flip.
  useEffect(() => {
    if (!pdf || loading || !numPages || loadAll) return;

    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    const cancelIdle = (window as Window & {
      cancelIdleCallback?: (id: number) => void;
    }).cancelIdleCallback;

    if (requestIdle) {
      const idleId = requestIdle(() => setLoadAll(true), { timeout: 1500 });
      return () => cancelIdle?.(idleId);
    }

    const timer = window.setTimeout(() => setLoadAll(true), 700);
    return () => window.clearTimeout(timer);
  }, [loadAll, loading, numPages, pdf]);

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isSearchResultsSheetOpen, setIsSearchResultsSheetOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const toggleZoomAtPoint = useCallback((clientX: number, clientY: number, containerElement: HTMLElement) => {
    setZoom(prevZoom => {
      const nextZoom = prevZoom > 1 ? 1 : DOUBLE_TAP_ZOOM;
      
      if (nextZoom === 1) {
        setZoomOrigin({ x: '50%', y: '50%' });
        setPan({ x: 0, y: 0 });
      } else {
        const spreadElement = containerElement.querySelector('.pdf-book-spread') || containerElement.querySelector('.pdf-stage');
        const rect = spreadElement ? (spreadElement as HTMLElement).getBoundingClientRect() : containerElement.getBoundingClientRect();
        
        const originX = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const originY = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        setZoomOrigin({ x: `${originX}%`, y: `${originY}%` });
      }
      return nextZoom;
    });
  }, [DOUBLE_TAP_ZOOM]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 50);
  };

  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false);
    setIsSearchResultsSheetOpen(false);
  };

  const submitMobileSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) return;

    const results = await performSearch(query);
    if (results && results.length > 0) {
      setIsSearchResultsSheetOpen(true);
    }
  };

  const nextMatchMobile = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchResults.length;
    setActiveMatchIndex(nextIdx);
    goToPage(searchResults[nextIdx].pageNumber);
  };

  const prevMatchMobile = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + searchResults.length) % searchResults.length;
    setActiveMatchIndex(prevIdx);
    goToPage(searchResults[prevIdx].pageNumber);
  };

  // Sync isSearchResultsSheetOpen with searchResults on mobile
  useEffect(() => {
    if (isMobileSearchOpen && searchResults.length > 0) {
      setIsSearchResultsSheetOpen(true);
    }
  }, [searchResults.length, isMobileSearchOpen]);

  // Load PDF
  useEffect(() => {
    let isMounted = true;

    const loadDoc = async () => {
      setLoading(true);
      setError(null);
      setLoadProgress(0);
      setReadyToRender(false);
      setPdf(null);
      setNumPages(0);
      setLoadAll(false);
      try {
        // Enforce absolute URL for PDF.js loading
        if (!url || typeof url !== 'string') throw new Error("URL de PDF no válida");
        const absoluteUrl = url.startsWith('/') ? window.location.origin + url : url;
        setDocCacheKey(absoluteUrl);
        console.log('Iniciando carga de PDF:', absoluteUrl);

        // Reuse a previously parsed document if the user already opened this
        // catalog — no re-download, no re-parse. Otherwise load + cache it. The
        // cache survives leaving/returning to the viewer.
        const cachedNow = getCachedDocument(absoluteUrl);
        if (cachedNow) setLoadProgress(100);

        const pdfDoc = await loadDocument(absoluteUrl, (progress) => {
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (isMounted) setLoadProgress(percent);
          }
        });
        console.log('PDF cargado con éxito. Páginas:', pdfDoc.numPages);
        
        if (!isMounted) return;

        // Get actual page size from first page
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setPdfPageSize({ width: viewport.width, height: viewport.height });
        
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setLoading(false);

        // Reuse existing metadata without starting OCR or parsing every page.
        if (currentDoc) {
          if (currentDoc.indexItems && currentDoc.indexItems.length > 0) {
            setIndexItems(currentDoc.indexItems);
            setIndexSource(currentDoc.indexItems[0]?.source || 'auto');
            setIndexStatus('ready');
          }

          getCachedPdfData(currentDoc.id).then(cached => {
            if (cached && isMountedRef.current) {
              if (cached.items && cached.items.length > 0) {
                setIndexItems(cached.items);
                setIndexStatus('ready');
                setIndexSource(cached.items[0].source);
              }
              if (cached.fullText && cached.fullText.length > 0) {
                setFullText(cached.fullText);
              }
            }
          });
        }

        // Thumbnails are now rendered lazily on demand (LazyPdfPageThumbnail
        // with IntersectionObserver) when the thumbnail panel is opened, so we
        // no longer eagerly pre-render every page's thumbnail here. This avoids
        // a second full-document render pass competing with the main viewer.
      } catch (err: any) {
        console.error('PDF load error:', err);
        if (isMounted) {
          const detail = err.message || 'Error desconocido';
          setError(`No se pudo visualizar el PDF. ${detail}. Verifique el enlace o la configuración de CORS.`);
          setLoading(false);
        }
      }
    };

    if (url) loadDoc();
    return () => {
      isMounted = false;
      // Intentionally DO NOT destroy the document here: the shared pdfCache
      // keeps it (and its rendered bitmaps) alive so returning to this catalog
      // is instant. The cache's LRU handles eventual cleanup.
    };
  }, [currentDoc, url]);

  // Resize handling
  useEffect(() => {
    const measure = () => {
      if (mainAreaRef.current) {
        const width = mainAreaRef.current.clientWidth;
        const height = mainAreaRef.current.clientHeight;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    };

    // Initial measure with fallback to viewport if ref not ready
    if (mainAreaRef.current) {
      measure();
    } else {
      // Use window size as immediate fallback to avoid total white screen
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight - 56;
      setContainerSize({ 
        width: winWidth, 
        height: winHeight 
      });
    }

    const observer = new ResizeObserver(measure);
    if (mainAreaRef.current) {
      observer.observe(mainAreaRef.current);
    }

    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Calculate sizes
  const dimensions = useMemo(() => {
    if (!containerSize.width || !containerSize.height || !pdfPageSize.width) return null;

    const pdfWidth = pdfPageSize.width;
    const pdfHeight = pdfPageSize.height;
    
    // Use absolute full container for maximum scale with minimal padding.
    // Mobile uses a single-page layout so the PDF occupies the full available width.
    const safePadding = isMobile ? 10 : 20;
    const safeWidth = Math.max(containerSize.width - (safePadding * 2), 1);
    const safeHeight = Math.max(containerSize.height - (safePadding * 2), 1);

    const pageRatio = pdfWidth / pdfHeight;
    const isDoublePage = !isMobile;
    const bookRatio = isDoublePage ? pageRatio * 2 : pageRatio;
    const containerRatio = safeWidth / safeHeight;

    let bookWidth;
    let bookHeight;

    if (containerRatio > bookRatio) {
      bookHeight = safeHeight;
      bookWidth = bookHeight * bookRatio;
    } else {
      bookWidth = safeWidth;
      bookHeight = bookWidth / bookRatio;
    }

    // Ensure we don't exceed container
    if (bookWidth > safeWidth) {
      bookWidth = safeWidth;
      bookHeight = bookWidth / bookRatio;
    }
    if (bookHeight > safeHeight) {
      bookHeight = safeHeight;
      bookWidth = bookHeight * bookRatio;
    }

    const pageWidth = isDoublePage ? bookWidth / 2 : bookWidth;
    const pageHeight = bookHeight;

    return {
      pageWidth: Math.floor(pageWidth),
      pageHeight: Math.floor(pageHeight),
      bookWidth: Math.floor(bookWidth),
      bookHeight: Math.floor(bookHeight),
      isDoublePage,
    };
  }, [containerSize, pdfPageSize, isMobile]);

  // Ensure ready strategy
  useEffect(() => {
    if (pdf && dimensions && dimensions.pageWidth > 0) {
      // Small timeout to allow container to stabilize in DOM
      const timer = setTimeout(() => {
        setReadyToRender(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pdf, dimensions]);

  // Handle initial page and search from props
  const initialProcessedRef = useRef(false);

  useEffect(() => {
    if (readyToRender && pdf && !initialProcessedRef.current) {
      initialProcessedRef.current = true;
      
      // Go to initial page
      if (initialPage && initialPage > 1) {
        setTimeout(() => {
          goToPage(initialPage);
        }, 300);
      }

      // Run initial search
      if (initialSearch) {
        setTimeout(() => {
          setSearchQuery(initialSearch);
          performSearch(initialSearch, initialPage);
          setSearchOpen(true);
        }, 500);
      }
    }
  }, [readyToRender, pdf, initialPage, initialSearch]);


  const hasNoText = useMemo(() => {
    if (fullText.length === 0) return false;
    return fullText.every(item => item.text.trim().length === 0);
  }, [fullText]);

  // Index Generation Utilities
  const normalizeText = (value: string) => {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const isPageNumber = (text: string) => /^\d{1,3}$|^(p|pag|pagina)\.?\s?\d{1,3}$/i.test(text.trim());
  const isPrice = (text: string) => /[$\u20ac\u00a3]\s?\d+([.,]\d{2})?|\d+([.,]\d{2})?\s?[$\u20ac\u00a3]/.test(text.trim());
  const isUrl = (text: string) => /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/.test(text.trim());
  const isEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
  const isPhone = (text: string) => /(\+?\d{1,4}[\s-])?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/.test(text.trim());

  const looksLikeTitle = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) return true;
    // Check for Title Case
    const words = trimmed.split(' ');
    if (words.length > 0 && words.every(w => w.length > 0 && w[0] === w[0].toUpperCase())) return true;
    return false;
  };

  const scoreHeadingCandidate = (candidate: any, pageStats: any) => {
    let score = 0;
    if (candidate.fontSize >= pageStats.avgFontSize * 1.5) score += 4;
    if (candidate.fontSize >= pageStats.avgFontSize * 1.25) score += 2;
    if (candidate.y / pageStats.height <= 0.25) score += 3; // Top of page
    if (looksLikeTitle(candidate.text)) score += 2;
    if (candidate.text.length <= 35) score += 1;
    if (candidate.text.length > 70) score -= 4;
    if (isPageNumber(candidate.text)) score -= 5;
    if (isPrice(candidate.text)) score -= 3;
    if (isUrl(candidate.text) || isEmail(candidate.text) || isPhone(candidate.text)) score -= 5;
    return score;
  };

  const buildAutoIndexFromPdf = useCallback(async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
    setIndexStatus('loading');
    try {
      const result = await buildIndexFromPdfDocument(pdfDoc, {
        enableOcr: true,
        maxOcrPages: 8,
      });

      if (result.items.length === 0 && result.fullTextLength < 50 && !result.usedOcr) {
        setIndexStatus('no-text');
        return;
      }

      if (result.items.length === 0) {
        setIndexStatus('empty');
      } else {
        setIndexItems(result.items);
        setIndexSource(result.source);
        setIndexStatus('ready');
      }
    } catch (err) {
      console.error('Index generation error:', err);
      setIndexStatus('error');
    }
  }, []);

  // Search logic
  const performSearch = useCallback(async (query: string, preferredPage?: number) => {
    if (!pdf || query.trim().length < 2) {
      setSearchResults([]);
      setActiveMatchIndex(-1);
      return [];
    }

    setIsSearching(true);
    const results: SearchMatch[] = [];
    const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizeSearchText = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const createSearchSnippet = (text: string) => {
      const normalizedText = normalizeSearchText(text);
      const matchIndex = normalizedText.indexOf(normalizedQuery);
      if (matchIndex === -1) return text.slice(0, 180).trim();
      const start = Math.max(0, matchIndex - 70);
      const end = Math.min(text.length, matchIndex + query.length + 90);
      return `${start > 0 ? '...' : ''}${text.slice(start, end).trim()}${end < text.length ? '...' : ''}`;
    };

    // If we have fullText, use it for instant matching instead of re-parsing PDF
    if (fullText.length > 0) {
      console.log('[Flipbook] Performing instant search via fullText cache');
      const matchesByPage = new Map<number, { page: number, text: string }[]>();
      
      for (const item of fullText) {
        const normalizedItemText = item.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedItemText.includes(normalizedQuery)) {
            if (!matchesByPage.has(item.page)) matchesByPage.set(item.page, []);
            matchesByPage.get(item.page)!.push(item);
        }
      }

      for (const [pageNumber, pageMatches] of matchesByPage) {
            try {
                const page = await pdf.getPage(pageNumber);
                const textContent = await page.getTextContent();
                const viewport = page.getViewport({ scale: 1 });
                const resultCountBeforePage = results.length;
                
                textContent.items.forEach((txtItem: any) => {
                    if (!txtItem || typeof txtItem.str !== 'string') return;
                    const normalizedTxtItem = normalizeSearchText(txtItem.str);
                    if (normalizedTxtItem.includes(normalizedQuery)) {
                        const transform = txtItem.transform;
                        const [x, y, w, h] = [transform[4], transform[5], txtItem.width, txtItem.height];
                        
                        const rect: HighlightRect = {
                          left: (x / viewport.width) * 100,
                          top: ((viewport.height - y - h) / viewport.height) * 100,
                          width: (w / viewport.width) * 100,
                          height: (h / viewport.height) * 100
                        };

                        results.push({
                          id: `match-${pageNumber}-${Math.random().toString(36).substring(2, 9)}`,
                          pageNumber: pageNumber,
                          text: txtItem.str,
                          rects: [rect]
                        });
                    }
                });

                if (results.length === resultCountBeforePage) {
                  const pageText = pageMatches.map(item => item.text).join(' ');
                  results.push({
                    id: `match-${pageNumber}-page-${Math.random().toString(36).substring(2, 9)}`,
                    pageNumber,
                    text: createSearchSnippet(pageText),
                    rects: []
                  });
                }
            } catch (e) {
                console.warn(`Search match error on page ${pageNumber}:`, e);
            }
      }
    } else {
        // Fallback to slow linear search
        for (let i = 1; i <= pdf.numPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1 });
            if (textContent && Array.isArray(textContent.items)) {
              const resultCountBeforePage = results.length;
              const pageText = textContent.items.map((item: any) => item?.str || '').join(' ');

              textContent.items.forEach((item: any) => {
                if (!item || typeof item.str !== 'string') return;
                const normalizedItemText = normalizeSearchText(item.str);

                if (normalizedItemText.includes(normalizedQuery)) {
                  // ... inside loop
                  const transform = item.transform;
                  const [x, y, w, h] = [transform[4], transform[5], item.width, item.height];
                  
                  const rect: HighlightRect = {
                    left: (x / viewport.width) * 100,
                    top: ((viewport.height - y - h) / viewport.height) * 100,
                    width: (w / viewport.width) * 100,
                    height: (h / viewport.height) * 100
                  };

                  results.push({
                    id: `match-${i}-${Math.random().toString(36).substring(2, 9)}`,
                    pageNumber: i,
                    text: item.str,
                    rects: [rect]
                  });
                }
              });

              if (results.length === resultCountBeforePage && normalizeSearchText(pageText).includes(normalizedQuery)) {
                results.push({
                  id: `match-${i}-page-${Math.random().toString(36).substring(2, 9)}`,
                  pageNumber: i,
                  text: createSearchSnippet(pageText),
                  rects: []
                });
              }
            }
          } catch (e) {
            console.warn(`Search error on page ${i}:`, e);
          }
        }
    }

    setSearchResults(results);
    setIsSearching(false);
    setHighlightsVisible(results.length > 0);
    
    if (results.length > 0) {
      let targetIdx = -1;
      
      // 1. Try preferredPage if provided
      if (preferredPage) {
        targetIdx = results.findIndex(r => r.pageNumber === preferredPage);
      }
      
      // 2. Try current page from state
      if (targetIdx === -1) {
        const currentPageIndex = dimensions?.isDoublePage
          ? bookRef.current?.pageFlip?.()?.getCurrentPageIndex() || currentPage
          : currentPage;
        targetIdx = results.findIndex(r => r.pageNumber === currentPageIndex + 1);
      }
      
      const definitiveIdx = targetIdx !== -1 ? targetIdx : 0;
      setActiveMatchIndex(definitiveIdx);
      
      const targetPage = results[definitiveIdx].pageNumber;
      
      // Auto-zoom onto the first match
      goToPage(targetPage, true);
      setTimeout(() => {
        const rect = results[definitiveIdx].rects[0];
        if (rect) {
          setZoomOrigin({ 
            x: `${rect.left + rect.width / 2}%`, 
            y: `${rect.top + rect.height / 2}%` 
          });
          setZoom(SEARCH_FOCUS_ZOOM);
        }
      }, 300);

      return results;
    } else {
      setActiveMatchIndex(-1);
      if (hasNoText) {
        console.warn("Este PDF no tiene texto buscable.");
      } else {
        if (isMobile) {
          console.log("Sin resultados");
        }
      }
      return [];
    }
  }, [pdf, numPages, fullText, hasNoText, isMobile, currentPage, dimensions?.isDoublePage]);

  const handleSearchResultClick = (index: number) => {
    const result = searchResults[index];
    if (!result) return;
    
    // 1. Go to page FIRST (with zoom reset skipped)
    goToPage(result.pageNumber, true);
    
    // 2. Then apply subtle zoom
    setActiveMatchIndex(index);
    setHighlightsVisible(true);
    
    setTimeout(() => {
      if (result.rects && result.rects.length > 0) {
        const rect = result.rects[0];
        setZoomOrigin({ 
          x: `${rect.left + rect.width / 2}%`, 
          y: `${rect.top + rect.height / 2}%` 
        });
        setZoom(SEARCH_FOCUS_ZOOM);
      }
    }, 100);
  };

  const clearSearch = () => {
    // If we have an active selection, keep only that one and stop showing others
    if (activeMatchIndex !== -1 && searchResults[activeMatchIndex]) {
      const activeMatch = searchResults[activeMatchIndex];
      setSearchResults([activeMatch]);
      setActiveMatchIndex(0);
      setHighlightsVisible(true);
      setSearchQuery(''); // Clear query but keep the one match
      
      // Close panels so user can "navigate normally" as requested
      setSearchOpen(false);
      setIsMobileSearchOpen(false);
      setIsSearchResultsSheetOpen(false);
    } else {
      setSearchQuery('');
      setSearchResults([]);
      setActiveMatchIndex(-1);
      setHighlightsVisible(false);
      resetZoom();
    }
  };

  const nextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchResults.length;
    handleSearchResultClick(nextIdx);
  };

  const prevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + searchResults.length) % searchResults.length;
    handleSearchResultClick(prevIdx);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      performSearch(searchQuery);
      setSearchOpen(true);
    }
  };

  const goToPage = (num: number, skipZoomReset = false) => {
    if (!skipZoomReset) resetZoom();

    const total = numPages || 1;
    const safePage = Math.min(Math.max(num, 1), total);
    setPageInput(safePage.toString());
    verifyPageWindow(safePage - 1);

    if (!dimensions?.isDoublePage) {
      setCurrentPage(safePage - 1);
      return;
    }
    
    // User's specific logic for flip index
    let flipIndex = 0;
    if (safePage > 1) {
      // For showCover=true:
      // Page 1 is index 0.
      // Page 2 is index 1.
      // Page 3 is index 2.
      // Jumping to index 1 or 2 should show the 2-3 spread.
      flipIndex = safePage - 1;
    }

    const turnFlipbookToPage = () => {
      const pageFlipInstance = bookRef.current?.pageFlip?.();
      if (pageFlipInstance && typeof pageFlipInstance.turnToPage === 'function') {
        pageFlipInstance.turnToPage(flipIndex);
        return true;
      } else if (pageFlipInstance && typeof pageFlipInstance.flip === 'function') {
        pageFlipInstance.flip(flipIndex);
        return true;
      }
      return false;
    };

    if (!turnFlipbookToPage()) {
      setTimeout(turnFlipbookToPage, 300);
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputBlur = () => {
    const val = parseInt(pageInput);
    if (!isNaN(val)) {
      goToPage(val);
    } else {
      setPageInput((currentPage + 1).toString());
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputBlur();
    }
  };

  // Sync page input with current page
  useEffect(() => {
    setPageInput((currentPage + 1).toString());
  }, [currentPage]);

  const downloadPdf = useCallback(async () => {
    const finalUrl = downloadUrl || url;
    if (!finalUrl) {
      console.error("No existe URL de descarga para este catálogo");
      return;
    }

    try {
      const response = await fetch(finalUrl);
      if (!response.ok) throw new Error("No se pudo descargar el PDF");
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      const fileName = title.trim()
        ? `${title.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_')}.pdf`
        : 'catalogo.pdf';
        
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.warn("Error al descargar via fetch, intentando apertura directa:", error);
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }
  }, [url, downloadUrl, title]);


  const pageIndicatorStr = useMemo(() => {
    if (!numPages) return '0 / 0';
    if (!dimensions?.isDoublePage) {
      return `${Math.min(currentPage + 1, numPages)} / ${numPages}`;
    }
    if (currentPage === 0) return `1 / ${numPages}`;
    const next = currentPage + 1;
    if (next >= numPages) return `${numPages} / ${numPages}`;
    return `${currentPage + 1}-${next + 1} / ${numPages}`;
  }, [currentPage, numPages, dimensions?.isDoublePage]);

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.25, 2.5));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.25, 1));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setZoomOrigin({ x: '50%', y: '50%' });
  };

  function goToPreviousPage(skipZoomReset = false) {
    if (!skipZoomReset) resetZoom();
    if (dimensions?.isDoublePage) {
      bookRef.current?.pageFlip?.()?.flipPrev?.();
      return;
    }

    goToPage(Math.max(1, currentPage), true);
  }

  function goToNextPage(skipZoomReset = false) {
    if (!skipZoomReset) resetZoom();
    if (dimensions?.isDoublePage) {
      bookRef.current?.pageFlip?.()?.flipNext?.();
      return;
    }

    goToPage(Math.min(numPages || 1, currentPage + 2), true);
  }

  const activeIndexItem = useMemo(() => {
    if (!indexItems.length) return null;
    const current = currentPage + 1;
    let found = indexItems[0];
    for (const item of indexItems) {
      if (item.pageNumber <= current) {
        found = item;
      } else {
        break;
      }
    }
    return found;
  }, [indexItems, currentPage]);

  // Helper to build a tree from a flat list based on 'level'
  const buildTocTree = useCallback((items: PdfIndexItem[]): PdfIndexItem[] => {
    const root: PdfIndexItem[] = [];
    const stack: PdfIndexItem[] = [];

    items.forEach(item => {
      const node = { ...item, children: [] as PdfIndexItem[] };
      
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(node);
      } else {
        if (!stack[stack.length - 1].children) stack[stack.length - 1].children = [];
        stack[stack.length - 1].children!.push(node);
      }
      
      stack.push(node);
    });

    return root;
  }, []);

  const tocTree = useMemo(() => buildTocTree(indexItems), [indexItems, buildTocTree]);

  const toggleIndexItem = (id: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    setExpandedIndexItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Automatically expand parents of the active item
  useEffect(() => {
    if (!activeIndexItem) return;
    
    // Find all parents of the active item to ensure they are expanded
    const expandParents = (itemId: string) => {
      const idx = indexItems.findIndex(n => n.id === itemId);
      if (idx === -1) return;
      
      let currentLevel = indexItems[idx].level;
      const parentsToExpand: string[] = [];
      
      for (let i = idx - 1; i >= 0; i--) {
        if (indexItems[i].level < currentLevel) {
          parentsToExpand.push(indexItems[i].id);
          currentLevel = indexItems[i].level;
          if (currentLevel === 0) break;
        }
      }
      
      if (parentsToExpand.length > 0) {
        setExpandedIndexItems(prev => {
          let needsUpdate = false;
          const next = new Set(prev);
          parentsToExpand.forEach(p => {
            if (!next.has(p)) {
              next.add(p);
              needsUpdate = true;
            }
          });
          return needsUpdate ? next : prev;
        });
      }
    };
    
    expandParents(activeIndexItem.id);
  }, [activeIndexItem, indexItems]);

  const verifyPageWindow = useCallback((pageIndex: number) => {
    const root = mainAreaRef.current;
    if (!root || numPages === 0) return;

    const centerPage = Math.min(Math.max(pageIndex + 1, 1), numPages);
    const firstPage = Math.max(1, centerPage - 2);
    const lastPage = Math.min(numPages, centerPage + 10);

    const verify = () => {
      for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber++) {
        const pageNodes = root.querySelectorAll<QueuedPdfPageElement>(
          `[data-pdf-page="${pageNumber}"]`,
        );
        pageNodes.forEach((pageNode) => {
          if (pageNode.dataset.pdfRendered !== 'true') {
            pageNode.ensurePdfPage?.();
          }
        });
      }
    };

    window.requestAnimationFrame(verify);
    window.setTimeout(verify, 280);
  }, [numPages]);

  useEffect(() => {
    if (readyToRender) verifyPageWindow(currentPage);
  }, [currentPage, readyToRender, verifyPageWindow]);

  const renderPdfPage = (pageNumber: number, key: string) => {
    if (!dimensions) return null;

    const centerPage = currentPage + 1;
    const eager =
      pageNumber <= 2 ||
      (pageNumber >= centerPage - 2 && pageNumber <= centerPage + 10);
    const priority =
      pageNumber <= 2 ||
      Math.abs(pageNumber - centerPage) <= 2;

    const pageHighlights = highlightsVisible ? (searchResults || [])
      .filter(res => res && res.pageNumber === pageNumber)
      .flatMap(res => res.rects.map(r => ({
        rect: r,
        isActive: activeMatchIndex !== -1 && searchResults[activeMatchIndex] === res
      }))) : [];

    return (
      <QueuedPdfPage
        key={key}
        number={pageNumber}
        pdf={pdf}
        width={dimensions.pageWidth}
        height={dimensions.pageHeight}
        zoom={zoom}
        eager={eager}
        priority={priority}
        loadAll={loadAll}
        docUrl={docCacheKey}
        highlights={pageHighlights}
        isActiveMatchPage={activeMatchIndex !== -1 && searchResults[activeMatchIndex] && searchResults[activeMatchIndex].pageNumber === pageNumber}
      />
    );
  };

  return (
    <>
      <div className="pdf-viewer-shell">
        <div className={cn(
          "pdf-reader-page", 
          !isIndexOpen && "is-sidebar-collapsed",
          isThumbnailPanelOpen && "has-thumbnail-sidebar"
        )}>
        {/* 1. PANEL IZQUIERDO DE ÍNDICE / CONTENIDO */}
        <aside className="pdf-content-sidebar">
          <div className="pdf-content-header">
            <span>CONTENIDO</span>
            <button onClick={() => setIsIndexOpen(false)} aria-label="Cerrar índice">×</button>
          </div>

        <nav className="pdf-content-list">
          {indexStatus === 'loading' ? (
            <div className="py-20 flex flex-col items-center gap-4 text-center px-6">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
              <p className="text-xs text-gray-400 font-medium">Analizando secciones...</p>
            </div>
          ) : indexStatus === 'ready' ? (
            <div className="flex flex-col gap-0.5">
              {(() => {
                const renderItems = (items: PdfIndexItem[], level: number = 0) => {
                  return items.map((item) => {
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedIndexItems.has(item.id);
                    const isActive = activeIndexItem?.id === item.id;

                    return (
                      <div key={item.id} className="flex flex-col">
                        <div className="relative group">
                          <button 
                            onClick={() => {
                              goToPage(item.pageNumber);
                              if (isMobile) setIsIndexOpen(false);
                            }}
                            className={cn(
                              "pdf-content-item items-center py-2.5 transition-colors w-full",
                              isActive && "is-active",
                              level === 0 ? "font-bold" : "font-medium"
                            )}
                            style={{ paddingLeft: `${22 + level * 16}px` }}
                          >
                            <span className={cn(
                              "flex-1 text-sm overflow-hidden text-ellipsis whitespace-nowrap",
                              isActive ? "text-white" : "text-gray-900/80"
                            )}>
                              {item.title}
                            </span>
                            <strong className={cn(
                              "text-[10px] tabular-nums",
                              isActive ? "text-white/80" : "text-gray-400"
                            )}>
                              {item.pageNumber.toString().padStart(2, '0')}
                            </strong>
                          </button>
                          
                          {hasChildren && (
                            <button
                              onClick={(e) => toggleIndexItem(item.id, e)}
                              className={cn(
                                "absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md transition-colors z-10",
                                isActive ? "text-white/40" : "text-gray-400 hover:bg-gray-100",
                                isExpanded && "rotate-0"
                              )}
                              aria-label={isExpanded ? "Contraer" : "Expandir"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>

                        {hasChildren && isExpanded && (
                          <div className="flex flex-col">
                            {renderItems(item.children!, level + 1)}
                          </div>
                        )}
                      </div>
                    );
                  });
                };
                return renderItems(tocTree);
              })()}
            </div>
          ) : (
            <div className="py-20 px-8 text-center text-gray-400">
              <p className="text-xs">No hay contenido disponible</p>
            </div>
          )}
        </nav>

        <button onClick={downloadPdf} className="pdf-download-card group">
          <Download className="transition-transform group-hover:translate-y-0.5" />
          <span>
            <strong>Descargar catálogo</strong>
            <small>PDF {currentDoc?.fileSize ? formatFileSize(currentDoc.fileSize) : "--- MB"}</small>
          </span>
        </button>
      </aside>

      {/* ÁREA PRINCIPAL DEL VISOR */}
      <main className="pdf-reader-main">
        <div className="pdf-viewer-container">
          {/* 2. TOOLBAR SUPERIOR */}
          <header className="pdf-reader-toolbar !justify-between">
            <div className="pdf-toolbar-left">
              {!isIndexOpen && (
                <button 
                  onClick={() => setIsIndexOpen(true)}
                  className="hover:bg-gray-100 transition-colors"
                  title="Abrir índice"
                >
                  <ListIcon className="w-5 h-5" />
                </button>
              )}
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-2">Visor de Catálogo</span>
            </div>

            <div className="pdf-toolbar-actions">
              <button onClick={() => setSearchOpen(!searchOpen)} className={cn(searchOpen && "bg-gray-100")} title="Buscar">
                <SearchIcon className="w-5 h-5" />
              </button>
              {zoom > 1 && (
                <button 
                  onClick={resetZoom} 
                  title="Restablecer" 
                  className="bg-gray-100 text-blue-600 rounded-full"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              )}
              <button onClick={zoomOut} title="Zoom Out">
                <ZoomOut className="w-5 h-5" />
              </button>
              <button onClick={zoomIn} title="Zoom In">
                <ZoomIn className="w-5 h-5" />
              </button>
              <button onClick={() => mainAreaRef.current?.requestFullscreen()} title="Pantalla completa">
                <Maximize2 className="w-5 h-5" />
              </button>
              <button 
                className={cn(isThumbnailPanelOpen && "is-active")}
                title="Grid" 
                onClick={() => setIsThumbnailPanelOpen(!isThumbnailPanelOpen)}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* 3. ÁREA CENTRAL DEL LIBRO */}
          <section 
            className="pdf-stage" 
            ref={mainAreaRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            <div className="pdf-book-area">
              {/* BOTONES LATERALES */}
              <button 
                className="pdf-side-nav pdf-side-nav--prev"
                onClick={() => goToPreviousPage()}
                aria-label="Página anterior"
                disabled={currentPage === 0}
                style={{ opacity: currentPage === 0 ? 0 : 1, pointerEvents: currentPage === 0 ? 'none' : 'auto' }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="pdf-book-wrapper">
                 {/* Loading & Error Overlays */}
                 {(loading || !readyToRender) && !error && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl">
                      <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
                      <p className="mt-4 text-xs font-bold text-gray-800">{loadProgress}% Cargando...</p>
                    </div>
                  )}

                  {error && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white p-8 text-center rounded-2xl border border-red-100">
                      <FileWarning className="w-12 h-12 text-red-500 mb-4" />
                      <p className="text-sm font-medium text-gray-900">{error}</p>
                      <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold">
                        Reintentar
                      </button>
                    </div>
                  )}

                {dimensions && readyToRender && (
                  <div 
                    className={cn("pdf-book-spread", zoom > 1 && "is-zoomed", !dimensions.isDoublePage && "is-single-page")}
                    style={{ 
                      width: dimensions.bookWidth, 
                      height: dimensions.bookHeight,
                      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                      transformOrigin: `${zoomOrigin.x} ${zoomOrigin.y}`,
                      transition: isPanning ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0.2, 1)'
                    }}
                  >
                    {dimensions.isDoublePage ? (
                      // @ts-ignore
                      <HTMLFlipBook
                        key={`flipbook-${pdf?.fingerprint || 'ready'}-spread`}
                        ref={bookRef}
                        width={dimensions.pageWidth}
                        height={dimensions.pageHeight}
                        size="stretch"
                        minWidth={1}
                        maxWidth={dimensions.bookWidth}
                        minHeight={1}
                        maxHeight={dimensions.bookHeight}
                        usePortrait={false}
                        startPage={currentPage}
                        /* Let our own gesture layer fully control input: this
                           stops react-pageflip from flipping on its own click/
                           drag, which was stealing the first tap of a double-tap
                           (causing accidental page turns instead of zoom). Flips
                           are still animated via the pageFlip() API. */
                        useMouseEvents={false}
                        clickEventForward={false}
                        onFlip={(e: any) => {
                          const pageIndex = e.data;
                          setCurrentPage(pageIndex);
                          setPageInput((pageIndex + 1).toString());
                          verifyPageWindow(pageIndex);
                          if (zoom > 1.5) resetZoom();
                        }}
                        showCover={true}
                        drawShadow={true}
                        maxShadowOpacity={0.3}
                        mobileScrollSupport={false}
                        flippingTime={700}
                        className="pdf-flipbook"
                        style={{ margin: '0 auto' }}
                        autoSize={true}
                      >
                        {Array.from({ length: numPages }).map((_, i) => renderPdfPage(i + 1, `page-${i}`))}
                      </HTMLFlipBook>
                    ) : (
                      <div className="pdf-mobile-single-page">
                        {renderPdfPage(
                          Math.min(Math.max(currentPage + 1, 1), numPages || 1),
                          `mobile-page-${currentPage}`
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

                <button 
                  className="pdf-side-nav pdf-side-nav--next"
                  onClick={() => goToNextPage()}
                  aria-label="Página siguiente"
                  disabled={currentPage >= numPages - 1}
                  style={{ opacity: currentPage >= numPages - 1 ? 0 : 1, pointerEvents: currentPage >= numPages - 1 ? 'none' : 'auto' }}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
            </div>
          </section>

          {/* 4. BARRA INFERIOR DE PROGRESO */}
          <footer className="pdf-progress-toolbar">
            <span className="tabular-nums">
              {pageIndicatorStr}
            </span>
            <input 
              type="range" 
              min="1" 
              max={numPages} 
              value={currentPage + 1}
              onChange={(e) => goToPage(parseInt(e.target.value))}
              className="pdf-progress-slider"
            />
            <button 
              className={cn(isThumbnailPanelOpen && "is-active")}
              title="Miniaturas" 
              onClick={() => setIsThumbnailPanelOpen(!isThumbnailPanelOpen)}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </footer>
        </div>
      </main>

        {/* PANEL DERECHO DE MINIATURAS (Sibling of main) */}
        <AnimatePresence>
          {isThumbnailPanelOpen && (
            <motion.aside 
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              className="pdf-thumbnail-sidebar"
            >
              <div className="pdf-thumbnail-header">
                <span>MINIATURAS</span>
                <button onClick={() => setIsThumbnailPanelOpen(false)} aria-label="Cerrar miniaturas">×</button>
              </div>

              <div className="pdf-thumbnail-list">
                {Array.from({ length: numPages }).map((_, i) => {
                  const pageNumber = i + 1;
                  const isActive = currentPage === i || (dimensions?.isDoublePage && currentPage + 1 === i);
                  
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => {
                        goToPage(pageNumber);
                        if (isMobile) setIsThumbnailPanelOpen(false);
                      }}
                      className={cn(
                        "pdf-thumbnail-item",
                        isActive && "is-active"
                      )}
                    >
                      <div className="pdf-thumbnail-canvas-wrapper">
                        <LazyPdfPageThumbnail 
                          pdf={pdf} 
                          pageNumber={pageNumber} 
                          cache={thumbnailCache}
                          onThumbnailRendered={(p, data) => {
                            setThumbnailCache(prev => {
                              if (prev.has(p)) return prev;
                              const next = new Map(prev);
                              next.set(p, data);
                              return next;
                            });
                          }}
                        />
                      </div>
                      <span>Pág. {pageNumber}</span>
                    </button>
                  );
                })}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* BÚSQUEDA PANEL (FLOTANTE DENTRO DE PAGE) */}
        <AnimatePresence>
          {searchOpen && (
            <motion.aside 
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-[60] border-l border-gray-100 flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight text-gray-900">BÚSQUEDA</h3>
                  {searchResults.length > 0 && (
                    <button 
                      onClick={clearSearch}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      LIMPIAR
                    </button>
                  )}
                </div>
                <button onClick={() => setSearchOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              
              <div className="px-5 py-4 border-b border-gray-100 bg-white">
                <form onSubmit={handleSearch} className="relative flex items-center group">
                  <div className="flex-1 bg-gray-50 rounded-xl flex items-center px-4 py-2.5 transition-all border border-gray-100 focus-within:border-gray-300 focus-within:bg-white group-hover:bg-white">
                    <button
                      type="submit"
                      className="text-gray-400 hover:text-gray-900 transition-colors mr-3 flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={searchQuery.trim().length < 2 || isSearching}
                      aria-label="Buscar en este catalogo"
                      title="Buscar"
                    >
                      <SearchIcon className="w-4 h-4" />
                    </button>
                    <input 
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar en este catálogo..."
                      className="bg-transparent outline-none text-sm w-full text-gray-900 pr-1"
                    />
                    {isSearching ? (
                      <div className="w-3 h-3 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin flex-shrink-0" />
                    ) : searchQuery && (
                      <button 
                        type="button"
                        onClick={clearSearch}
                        className="text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {searchResults.length > 0 ? (
                  searchResults.map((res, i) => (
                    <button 
                      key={i}
                      onClick={() => handleSearchResultClick(i)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl mb-2 transition-all border",
                        activeMatchIndex === i ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-bold",
                        activeMatchIndex === i ? "text-white/80" : "text-gray-400"
                      )}>PÁGINA {res.pageNumber}</span>
                      <p className="text-xs line-clamp-2 mt-1">{res.text}</p>
                    </button>
                  ))
                ) : searchQuery && !isSearching && (
                  <p className="text-center text-xs text-gray-400 py-12">No hay resultados</p>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>

    {/* SECCIÓN DE DETALLES DEL CATÁLOGO (OUTSIDE THE VIEWER VIEWPORT) */}
    <CatalogViewerDetails 
      title={title}
      coverUrl={currentDoc?.coverUrl || "/images/placeholders/catalog_chaide_1.jpg"}
      numPages={numPages}
      loading={loading}
      downloadPdf={downloadPdf}
      canDownload={!!(url || downloadUrl)}
      pageCount={currentDoc?.pageCount}
      fileSize={currentDoc?.fileSize}
      relatedDocuments={documents.filter(d => d.title !== title).slice(0, 4)}
    />

      <style dangerouslySetInnerHTML={{ __html: `
        .pdf-viewer-shell {
          width: 100%;
          height: calc(100dvh - var(--header-height, 78px));
          overflow: hidden;
          background: #f4f4f2;
        }

        .pdf-reader-page {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          background: #f4f4f2;
          color: #111;
          overflow: hidden;
          transition: grid-template-columns 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .pdf-reader-page.is-sidebar-collapsed {
          grid-template-columns: 0 minmax(0, 1fr);
        }

        .pdf-reader-page.has-thumbnail-sidebar {
          grid-template-columns: 280px minmax(0, 1fr) 300px;
        }

        .pdf-reader-page.is-sidebar-collapsed.has-thumbnail-sidebar {
          grid-template-columns: 0 minmax(0, 1fr) 300px;
        }

        .pdf-thumbnail-sidebar {
          height: 100%;
          background: rgba(255, 255, 255, 0.96);
          border-left: 1px solid rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 70;
          backdrop-filter: blur(10px);
        }

        .pdf-thumbnail-header {
          height: 72px;
          padding: 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          flex-shrink: 0;
        }

        .pdf-thumbnail-header span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: rgba(0,0,0,0.72);
        }

        .pdf-thumbnail-header button {
          border: 0;
          background: transparent;
          color: rgba(0,0,0,0.42);
          font-size: 24px;
          cursor: pointer;
        }

        .pdf-thumbnail-list {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 24px 20px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        .pdf-thumbnail-item {
          border: 0;
          background: transparent;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
          text-align: center;
          padding: 10px;
          border-radius: 12px;
          transition: all 200ms ease;
        }

        .pdf-thumbnail-item:hover {
          background: rgba(0,0,0,0.03);
        }

        .pdf-thumbnail-item.is-active {
          background: rgba(37, 99, 235, 0.08);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.5);
        }

        .pdf-thumbnail-canvas-wrapper {
          width: 100%;
          aspect-ratio: 0.72;
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pdf-thumbnail-canvas-wrapper canvas {
          width: 100%;
          height: auto;
          display: block;
        }

        .pdf-thumbnail-item span {
          font-size: 10px;
          font-weight: 700;
          color: rgba(0,0,0,0.5);
        }

        .pdf-thumbnail-item.is-active span {
          color: #2563eb;
        }

        @media (max-width: 767px) {
          .pdf-reader-page {
            grid-template-columns: 1fr !important;
          }
          .pdf-thumbnail-sidebar {
            position: fixed;
            top: 0;
            right: 0;
            width: 85vw;
            height: 100dvh;
            box-shadow: -20px 0 50px rgba(0,0,0,0.15);
            z-index: 100;
          }
        }

        .pdf-content-sidebar {
          height: 100%;
          background: rgba(255, 255, 255, 0.94);
          border-right: 1px solid rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          backdrop-blur: 10px;
        }

        .pdf-content-header {
          height: 72px;
          padding: 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          flex-shrink: 0;
        }

        .pdf-content-header span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: rgba(0,0,0,0.72);
        }

        .pdf-content-header button {
          border: 0;
          background: transparent;
          color: rgba(0,0,0,0.42);
          font-size: 24px;
          cursor: pointer;
        }

        .pdf-content-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 0;
        }

        .pdf-content-item {
          width: 100%;
          min-height: 40px;
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 22px;
          cursor: pointer;
          text-align: left;
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 6px;
        }

        .pdf-content-item.is-active {
          background: #2563eb !important;
          color: white !important;
          margin: 0 8px;
          width: calc(100% - 16px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
        }

        .pdf-content-item:not(.is-active):hover {
          background: rgba(0,0,0,0.04);
        }

        .pdf-download-card {
          margin: 18px;
          min-height: 68px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.12);
          background: #fff;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 16px;
          cursor: pointer;
          color: #111;
          text-align: left;
          transition: border-color 200ms ease;
        }
        
        .pdf-download-card:hover {
          border-color: #111;
        }

        .pdf-download-card svg {
          width: 20px;
          height: 20px;
        }

        .pdf-download-card strong {
          display: block;
          font-size: 13px;
          font-weight: 700;
        }

        .pdf-download-card small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: rgba(0,0,0,0.52);
        }

        .pdf-reader-main {
          min-width: 0;
          height: 100%;
          overflow: hidden;
          position: relative;
          background: #f4f4f2;
        }

        .pdf-viewer-container {
          height: 100%;
          width: 100%;
          display: grid;
          grid-template-rows: 72px minmax(0, 1fr) 76px;
          background: 
            radial-gradient(
              circle at center,
              rgba(0,0,0,0.045),
              transparent 42%
            ),
            #f4f4f2;
          flex-shrink: 0;
        }

        .catalog-viewer-details-section {
          background: #f8f8f6;
          border-top: 1px solid rgba(0, 0, 0, 0.08);
          padding: clamp(48px, 5vw, 76px) clamp(48px, 6vw, 96px);
          color: #111;
        }

        .catalog-viewer-details-inner {
          width: min(100%, 1440px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(420px, 520px) minmax(0, 1fr);
          gap: clamp(56px, 6vw, 96px);
          align-items: start;
        }

        .catalog-main-info {
          display: grid;
          grid-template-columns: 180px minmax(0, 1fr);
          gap: 34px;
          padding-right: clamp(36px, 4vw, 64px);
          border-right: 1px solid rgba(0, 0, 0, 0.10);
        }

        .catalog-info-cover-block h2 {
          margin: 24px 0 0;
          font-size: 24px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 780;
          color: #111;
        }

        .catalog-meta-grid {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 26px 34px;
        }

        .catalog-meta-item span {
          display: block;
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.36);
        }

        .catalog-meta-item strong {
          display: block;
          font-size: 16px;
          line-height: 1.35;
          font-weight: 560;
          color: rgba(0, 0, 0, 0.72);
        }

        .catalog-info-button {
          margin-top: 38px;
          width: min(100%, 260px);
          min-height: 58px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: #111;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .catalog-download-info-button {
          margin-top: 38px;
          width: fit-content;
          min-width: 240px;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: #fff;
          cursor: pointer;
          transition: all 240ms cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }

        .catalog-download-info-button:hover:not(:disabled) {
          border-color: #111;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
        }

        .catalog-download-info-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .catalog-download-info-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(1);
        }

        .catalog-info-button:hover {
          background: #fdfdfd;
          border-color: #111;
        }

        .related-catalogs-block {
          min-width: 0;
        }

        .related-catalogs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 36px;
        }

        .related-catalogs-header h2 {
          margin: 0;
          font-size: 26px;
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 780;
          color: #111;
        }

        .related-catalogs-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(120px, 1fr));
          gap: clamp(24px, 3vw, 38px);
          align-items: start;
        }

        .related-catalogs-row .catalog-preview-card {
          max-width: 150px;
        }

        .related-catalogs-row .catalog-preview-info {
          margin-top: 14px;
        }

        .related-catalogs-row .catalog-preview-info h3 {
          font-size: 17px;
          line-height: 1.1;
          letter-spacing: -0.035em;
          font-weight: 700;
        }

        .related-catalogs-row .catalog-preview-info p {
          display: none;
        }

        @media (max-width: 1100px) {
          .catalog-viewer-details-inner {
            grid-template-columns: 1fr;
          }

          .catalog-main-info {
            border-right: 0;
            padding-right: 0;
            border-bottom: 1px solid rgba(0, 0, 0, 0.10);
            padding-bottom: 42px;
          }

          .related-catalogs-row {
            grid-template-columns: repeat(2, minmax(110px, 1fr));
          }
        }

        @media (max-width: 767px) {
          .catalog-viewer-details-section {
            padding: 36px 20px 56px;
          }

          .catalog-main-info {
            grid-template-columns: 110px minmax(0, 1fr);
            gap: 20px;
          }

          .catalog-info-cover-block h2 {
            font-size: 18px;
          }

          .catalog-info-meta-block h2 {
            font-size: 28px;
          }

          .catalog-meta-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 18px;
          }

          .related-catalogs-row {
            display: flex;
            gap: 20px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            padding-bottom: 12px;
            -webkit-overflow-scrolling: touch;
          }

          .related-catalogs-row .catalog-preview-card {
            flex: 0 0 160px;
            scroll-snap-align: start;
          }
        }

        .pdf-reader-toolbar {
          height: 72px;
          padding: 0 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          background: #f4f4f2;
          border-bottom: 1px solid rgba(0,0,0,0.04);
        }

        .pdf-toolbar-left,
        .pdf-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pdf-toolbar-left strong {
          font-size: 14px;
          font-weight: 700;
          color: #111;
          margin-left: 8px;
        }

        .pdf-toolbar-actions button,
        .pdf-toolbar-left button {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: rgba(0,0,0,0.68);
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: all 180ms ease;
        }

        .pdf-toolbar-actions button:hover,
        .pdf-toolbar-left button:hover {
          background: rgba(0,0,0,0.055);
          color: #111;
        }

        .pdf-toolbar-actions button.is-active,
        .pdf-toolbar-left button.is-active {
          background: rgba(37, 99, 235, 0.1);
          color: #2563eb;
        }

        .pdf-stage {
          position: relative;
          min-height: 0;
          display: grid;
          place-items: center;
          padding: 8px 64px 4px;
          overflow: hidden;
          background: 
            radial-gradient(
              ellipse at center,
              rgba(0,0,0,0.055) 0%,
              rgba(0,0,0,0.025) 36%,
              transparent 68%
            );
        }

        .pdf-book-area {
          position: relative;
          width: fit-content;
          max-width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pdf-book-wrapper {
          position: relative;
          width: min(100%, 1280px);
          height: min(100%, calc(100dvh - 180px));
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pdf-book-spread {
          position: relative;
          display: flex;
          align-items: stretch;
          justify-content: center;
          box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25), 
                      0 18px 36px -18px rgba(0,0,0,0.3);
          cursor: zoom-in;
          will-change: transform;
        }

        .pdf-book-spread.is-zoomed {
          cursor: grab;
        }

        .pdf-book-spread.is-zoomed:active {
          cursor: grabbing;
        }

        .pdf-book-spread.is-single-page {
          overflow: hidden;
          background: #fff;
          box-shadow: 0 22px 50px -18px rgba(0,0,0,0.32),
                      0 12px 24px -18px rgba(0,0,0,0.36);
        }

        .pdf-mobile-single-page {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: stretch;
          justify-content: center;
          overflow: hidden;
          background: #fff;
        }

        .pdf-mobile-single-page > .page-container {
          width: 100%;
          height: 100%;
          border-right: 0;
          box-shadow: none;
        }

        .pdf-book-spread::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: clamp(10px, 1.2vw, 20px);
          transform: translateX(-50%);
          pointer-events: none;
          z-index: 52;
          background:
            linear-gradient(
              90deg,
              rgba(0,0,0,0.14) 0%,
              rgba(0,0,0,0.06) 35%,
              rgba(255,255,255,0.2) 50%,
              rgba(0,0,0,0.06) 65%,
              rgba(0,0,0,0.14) 100%
            );
          opacity: 0.38;
          filter: blur(0.6px);
        }

        .pdf-side-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 64px;
          border: 0;
          border-radius: 6px;
          background: #111;
          color: #fff;
          z-index: 55;
          cursor: pointer;
          display: grid;
          place-items: center;
          box-shadow: 0 12px 30px rgba(0,0,0,0.3);
          transition: all 200ms ease;
        }

        .pdf-side-nav--prev {
          left: -58px;
        }

        .pdf-side-nav--next {
          right: -58px;
        }

        .pdf-side-nav:hover {
          background: #000;
          transform: translateY(-50%) scale(1.05);
        }
        
        .pdf-side-nav:active {
          transform: translateY(-50%) scale(0.95);
        }

        .pdf-progress-toolbar {
          width: min(100% - 120px, 980px);
          height: 44px;
          margin: 8px auto 20px;
          border-radius: 14px;
          background: #111;
          color: #fff;
          display: grid;
          grid-template-columns: 100px minmax(0, 1fr) 40px;
          align-items: center;
          gap: 20px;
          padding: 0 20px;
          box-shadow: 0 14px 34px rgba(0,0,0,0.25);
          z-index: 50;
        }

        .pdf-progress-toolbar span {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255,255,255,0.86);
        }

        .pdf-progress-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 3px;
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        
        .pdf-progress-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255,255,255,0.5);
          transition: transform 150ms ease;
        }
        
        .pdf-progress-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .pdf-progress-toolbar button {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 200ms ease;
        }
        
        .pdf-progress-toolbar button:hover {
          opacity: 1;
        }

        @media (max-width: 767px) {
          .pdf-reader-page {
            grid-template-columns: 1fr;
          }

          .pdf-content-sidebar {
            position: fixed;
            inset: 0 auto 0 0;
            width: min(86vw, 300px);
            z-index: 100;
            transform: translateX(-100%);
            transition: transform 220ms ease;
          }

          .pdf-reader-page:not(.is-sidebar-collapsed) .pdf-content-sidebar {
            transform: translateX(0);
          }

          .pdf-reader-main {
            height: 100%;
            grid-template-rows: 60px minmax(0, 1fr) 68px;
          }

          .pdf-reader-toolbar {
            padding: 0 16px;
            height: 60px;
          }

          .pdf-stage {
            padding: 10px 10px 6px;
          }

          .pdf-book-wrapper {
            width: 100%;
            height: 100%;
            max-height: none;
          }

          .pdf-book-spread::after {
            display: none;
          }

          .pdf-side-nav {
            width: 40px;
            height: 40px;
            border-radius: 999px;
          }

          .pdf-side-nav--prev {
            left: 14px;
          }

          .pdf-side-nav--next {
            right: 14px;
          }

          .pdf-progress-toolbar {
            width: calc(100% - 32px);
            margin-bottom: 16px;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 12px;
          }
          
          .pdf-progress-toolbar button {
            display: none;
          }
        }
      ` }} />
    </>
  );
}
