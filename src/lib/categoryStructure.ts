export const FALLBACK_CATEGORY_ID = 'fichas-de-productos-e-innovaciones';
export const FALLBACK_CATEGORY_NAME = 'Fichas de productos e innovaciones';
export const FALLBACK_CATEGORY_SLUG = 'fichas-de-productos-e-innovaciones';

export function normalizeCategoryIdentity(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isFallbackCategory(category: { name?: string; slug?: string }) {
  return (
    normalizeCategoryIdentity(category.name) === normalizeCategoryIdentity(FALLBACK_CATEGORY_NAME) ||
    normalizeCategoryIdentity(category.slug) === FALLBACK_CATEGORY_SLUG
  );
}

export function findFallbackCategory<T extends { name?: string; slug?: string }>(categories: T[]) {
  return categories.find(isFallbackCategory);
}

export function orderPublicCategories<T extends { name?: string; slug?: string; order?: number }>(categories: T[]) {
  return [...categories].sort((left, right) => {
    const leftIsTempur = normalizeCategoryIdentity(`${left.name || ''} ${left.slug || ''}`).includes('tempur');
    const rightIsTempur = normalizeCategoryIdentity(`${right.name || ''} ${right.slug || ''}`).includes('tempur');
    if (leftIsTempur !== rightIsTempur) return leftIsTempur ? 1 : -1;
    return (left.order ?? 999) - (right.order ?? 999);
  });
}

export function splitCategoryMenuLabel(value: string): [string, string] {
  const normalized = normalizeCategoryIdentity(value);

  if (normalized === 'catalogo de productos') return ['Catálogo de', 'Productos'];
  if (normalized === 'catalogo de distribuidores') return ['Catálogo de', 'Distribuidores'];
  if (normalized === normalizeCategoryIdentity(FALLBACK_CATEGORY_NAME)) {
    return ['Fichas de productos', 'e innovaciones'];
  }

  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] || '', ''];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}
