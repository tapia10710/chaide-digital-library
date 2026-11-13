export const CREDIT_CATEGORY_SLUG = 'credito';
export const CREDIT_CATEGORY_NAME = 'HISTORIAL DE LISTA DE PRECIOS';
const LEGACY_CREDIT_CATEGORY_NAME = 'Crédito';

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isCreditCategory(slug?: string | null, name?: string | null) {
  return normalize(slug) === CREDIT_CATEGORY_SLUG ||
    normalize(name) === normalize(CREDIT_CATEGORY_NAME) ||
    normalize(name) === normalize(LEGACY_CREDIT_CATEGORY_NAME);
}
