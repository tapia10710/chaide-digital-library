export const isStaticSite = import.meta.env.VITE_STATIC_SITE === 'true';

export function publicAssetUrl(url: string | null | undefined) {
  if (!url || !isStaticSite) return url || '';

  if (url.startsWith('/storage/')) {
    return `${import.meta.env.BASE_URL}${url.slice(1)}`;
  }

  return url;
}

export function staticDataUrl(fileName: string) {
  return `${import.meta.env.BASE_URL}static-data/${fileName}`;
}
