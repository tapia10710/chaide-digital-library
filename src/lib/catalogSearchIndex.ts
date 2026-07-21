import type { DocumentDef } from './mockData';
import type { PdfIndexItem } from './pdfIndexerService';
import { isFirebaseSite, isStaticSite, staticDataUrl } from './runtimeConfig';

export type CatalogSearchPageData = {
  pageNumber: number;
  text: string;
};

export type PreparedPdfCatalog = {
  pageCount: number;
  pages: CatalogSearchPageData[];
  searchablePages: number;
  generatedCover: File | null;
  indexItems: PdfIndexItem[];
};

function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo generar la portada desde la primera página.'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.86);
  });
}

export function normalizeCatalogSearchText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanExtractedPdfText(value: string) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200_000);
}

export async function preparePdfCatalog(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<PreparedPdfCatalog> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('El archivo seleccionado no es un PDF.');
  }
  if (file.size === 0) throw new Error('El PDF está vacío.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder('ascii').decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') throw new Error('El archivo no contiene una estructura PDF válida.');
  onProgress?.(5);

  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: CatalogSearchPageData[] = [];
  let generatedCover: File | null = null;
  let indexItems: PdfIndexItem[] = [];

  try {
    const { buildIndexFromPdfDocument } = await import('./pdfIndexerService');
    const index = await buildIndexFromPdfDocument(pdf, { enableOcr: false });
    indexItems = index.items;
    if (pdf.numPages < 1) throw new Error('El PDF no contiene páginas.');
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      if (!(viewport.width > 0 && viewport.height > 0)) {
        throw new Error(`La página ${pageNumber} tiene dimensiones inválidas.`);
      }
      if (pageNumber === 1) {
        const coverScale = Math.min(900 / viewport.width, 1200 / viewport.height, 2);
        const coverViewport = page.getViewport({ scale: coverScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(coverViewport.width));
        canvas.height = Math.max(1, Math.round(coverViewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('El navegador no pudo preparar la portada del PDF.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: coverViewport }).promise;
        const coverName = `${file.name.replace(/\.pdf$/i, '') || 'catalogo'}-portada.jpg`;
        generatedCover = await canvasToJpegFile(canvas, coverName);
        canvas.width = 1;
        canvas.height = 1;
      }
      const content = await page.getTextContent();
      const text = cleanExtractedPdfText(
        content.items
          .map((item: any) => typeof item?.str === 'string' ? item.str : '')
          .join(' '),
      );
      pages.push({ pageNumber, text });
      onProgress?.(5 + Math.round((pageNumber / pdf.numPages) * 95));
      if (pageNumber % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    await pdf.destroy();
  }

  return {
    pageCount: pages.length,
    pages,
    searchablePages: pages.filter((page) => page.text.length > 0).length,
    generatedCover,
    indexItems,
  };
}

export async function loadPersistedCatalogSearchIndex(
  document: Pick<DocumentDef, 'id' | 'pageCount' | 'searchIndexVersion'>,
): Promise<CatalogSearchPageData[]> {
  if (isFirebaseSite && document.searchIndexVersion) {
    try {
      const { fetchFirebasePdfSearchIndex } = await import('./firebaseCatalog');
      const pages = await fetchFirebasePdfSearchIndex(
        document.id,
        document.searchIndexVersion,
        document.pageCount,
      );
      if (pages.length > 0) return pages;
    } catch (error) {
      console.warn(`[Search] Firestore index unavailable for ${document.id}:`, error);
    }
  }

  if (isStaticSite || isFirebaseSite) {
    try {
      const response = await fetch(
        staticDataUrl(`search-index/${encodeURIComponent(document.id)}.json`),
        { cache: 'force-cache' },
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.pages)
        ? data.pages
          .map((page: CatalogSearchPageData) => ({
            pageNumber: Number(page.pageNumber),
            text: cleanExtractedPdfText(page.text),
          }))
          .filter((page: CatalogSearchPageData) => page.pageNumber > 0)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}
