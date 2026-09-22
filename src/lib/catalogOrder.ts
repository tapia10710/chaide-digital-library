import type { DocumentDef } from './mockData';

export function parsePublicationOrder(value: string): number {
  if (!value.trim()) return 0;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('El orden debe ser un número entero positivo. Usa 0 o deja vacío para ordenar por fecha.');
  }
  return number;
}

export function compareCatalogOrder(a: DocumentDef, b: DocumentDef): number {
  const rank = (doc: DocumentDef) => Number.isSafeInteger(doc.publicationOrder) && doc.publicationOrder! > 0
    ? doc.publicationOrder! : Number.MAX_SAFE_INTEGER;
  const date = (doc: DocumentDef) => {
    const value = Date.parse(doc.createdAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  return rank(a) - rank(b) || date(b) - date(a) ||
    a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id);
}
