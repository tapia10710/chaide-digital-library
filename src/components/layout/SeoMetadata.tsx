import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { isCreditCategory } from '../../lib/creditAccess';
import { isDistributorCategory } from '../../lib/distributorAccess';

const SITE_URL = 'https://biblioteca-catalogos-chaide.web.app';
const SITE_NAME = 'Chaide Biblioteca Digital';
const DEFAULT_DESCRIPTION = 'Explora la Biblioteca Digital de Chaide: catálogos, fichas de productos e innovaciones para consultar información de nuestros productos.';

function meta(selector: string, attribute: 'name' | 'property', key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

export default function SeoMetadata() {
  const { pathname } = useLocation();
  const categories = useStore(state => state.categories);

  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    let title = 'Chaide Biblioteca Digital | Catálogos y fichas de productos';
    let description = DEFAULT_DESCRIPTION;
    let indexable = false;

    if (path === '/') {
      indexable = true;
    } else if (path === '/catalogos') {
      title = 'Catálogos de Chaide | Biblioteca Digital';
      description = 'Consulta los catálogos de productos de Chaide, organizados por categoría en nuestra biblioteca digital.';
      indexable = true;
    } else if (path === '/categorias') {
      title = 'Categorías de catálogos | Chaide Biblioteca Digital';
      description = 'Explora las categorías de catálogos y fichas de productos de Chaide.';
      indexable = true;
    } else if (path === '/acerca-de') {
      title = 'Acerca de la Biblioteca Digital de Chaide';
      description = 'Conoce la biblioteca digital de Chaide y cómo consultar sus catálogos y fichas de productos.';
      indexable = true;
    } else if (path.startsWith('/categoria/')) {
      const slug = decodeURIComponent(path.slice('/categoria/'.length));
      const category = categories.find(item => item.slug === slug && item.active !== false);
      if (category && !isDistributorCategory(slug, category.name) && !isCreditCategory(slug, category.name)) {
        title = `${category.name} | Catálogos de Chaide`;
        description = category.description?.trim() || `Consulta ${category.name.toLowerCase()} en la Biblioteca Digital de Chaide.`;
        indexable = true;
      }
    }

    document.title = title;
    meta('meta[name="description"]', 'name', 'description', description);
    meta('meta[name="robots"]', 'name', 'robots', indexable ? 'index, follow' : 'noindex, nofollow');
    meta('meta[property="og:title"]', 'property', 'og:title', title);
    meta('meta[property="og:description"]', 'property', 'og:description', description);
    meta('meta[property="og:url"]', 'property', 'og:url', `${SITE_URL}${path}`);

    const existingCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (indexable) {
      const canonical = existingCanonical || document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = `${SITE_URL}${path}`;
      if (!existingCanonical) document.head.appendChild(canonical);
    } else {
      existingCanonical?.remove();
    }
  }, [pathname, categories]);

  return null;
}
