import type { DocumentDef } from './mockData';

export const catalogCategories = [
  {
    label: 'Descanso',
    slug: 'descanso',
    description: 'Colchones, camas y soluciones para dormir mejor.',
    icon: 'Moon',
    order: 10,
    keywords: ['descanso', 'colchon', 'colchones', 'cama', 'dormitorio', 'sueno'],
  },
  {
    label: 'Muebles',
    slug: 'muebles',
    description: 'Muebles para sala, dormitorio y espacios de descanso.',
    icon: 'Sofa',
    order: 20,
    keywords: ['muebles', 'mueble', 'sala', 'sofa', 'cabecera'],
  },
  {
    label: 'Complementos',
    slug: 'complementos',
    description: 'Textiles y accesorios como sabanas, toallas, almohadas y protectores.',
    icon: 'Package',
    order: 30,
    keywords: ['complementos', 'complemento', 'textiles', 'textil', 'sabanas', 'sabana', 'toallas', 'cobijas', 'cobija', 'cobertores', 'duvet', 'edredones', 'edredon', 'telas', 'tela', 'accesorios', 'almohadas', 'protectores'],
  },
  {
    label: 'Hoteles',
    slug: 'hoteles',
    description: 'Catalogos y productos para proyectos hoteleros.',
    icon: 'Hotel',
    order: 40,
    keywords: ['hoteles', 'hotel', 'hotelera', 'hotelero', 'hospitality'],
  },
  {
    label: 'Espumas',
    slug: 'espumas',
    description: 'Espumas, confort tecnico y materiales de soporte.',
    icon: 'Waves',
    order: 50,
    keywords: ['espumas', 'espuma', 'foam', 'memory foam'],
  },
] as const;

export type CatalogCategory = (typeof catalogCategories)[number];
export type CatalogCategorySlug = CatalogCategory['slug'];

export function normalizeCatalogText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function getCatalogSectionHref(slug: CatalogCategorySlug) {
  return `/catalogos#${slug}`;
}

export function getDocumentSearchText(doc: DocumentDef) {
  return normalizeCatalogText([
    doc.title,
    doc.description,
    doc.category,
    ...(doc.tags || []),
    ...((doc.indexItems || []).map((item: any) => item?.title || '')),
  ].filter(Boolean).join(' '));
}

export function documentMatchesCatalogCategory(doc: DocumentDef, category: CatalogCategory) {
  const documentText = getDocumentSearchText(doc);
  return category.keywords.some((keyword) => documentText.includes(normalizeCatalogText(keyword)));
}
