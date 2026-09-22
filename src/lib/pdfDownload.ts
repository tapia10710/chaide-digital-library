function safePdfFileName(title: string) {
  const base = title
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return `${base || 'catalogo'}.pdf`;
}

function isAppleMobile() {
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(userAgent) || touchMac;
}

/** Starts the transfer inside the original tap to keep mobile download permission. */
export function downloadPdfFromUserGesture(url: string, title: string) {
  const finalUrl = String(url || '').trim();
  if (!finalUrl) throw new Error('La descarga no está disponible para este catálogo.');
  if (finalUrl.startsWith('firestore-pdf://')) {
    // Reserve an iOS tab inside the tap, before the complete-file download begins.
    const downloadTab = isAppleMobile() ? window.open('about:blank', '_blank') : null;
    if (downloadTab) downloadTab.document.body.textContent = 'Preparando la descarga del PDF completo…';
    void (async () => {
      const [{ loadPdfFromFirestore }, { parseFirestorePdfUrl }] = await Promise.all([
        import('./firebaseCatalog'), import('./pdfPartialLoading'),
      ]);
      const { id, version } = parseFirestorePdfUrl(finalUrl);
      const objectUrl = await loadPdfFromFirestore(id, undefined, version);
      if (downloadTab && !downloadTab.closed) downloadTab.location.replace(objectUrl);
      else downloadPdfFromUserGesture(objectUrl, title);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300_000);
    })().catch(error => {
      downloadTab?.close();
      alert(error instanceof Error ? error.message : 'No se pudo descargar el PDF.');
    });
    return;
  }

  const link = document.createElement('a');
  link.href = finalUrl;
  link.download = safePdfFileName(title);
  link.rel = 'noopener noreferrer';

  // iOS does not reliably honor `download` for PDF/blob URLs. Opening the PDF
  // from the same tap exposes its native “Guardar en Archivos” action without
  // a popup being blocked after a long asynchronous fetch.
  if (isAppleMobile()) link.target = '_blank';

  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
