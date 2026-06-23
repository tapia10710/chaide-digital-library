import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';

interface PromotionalBannerProps {
  className?: string;
}

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

const MOBILE_QUERY = '(max-width: 767px)';

// Reliable viewport switch: render ONLY the variant for the current device so
// the web (4:1) and mobile (9:10) banners can never appear at the same time,
// independent of any CSS caching/cascade quirks.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler); // older Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  return isMobile;
}

export default function PromotionalBanner({ className = '' }: PromotionalBannerProps) {
  const banner = useStore((state) => state.promotionalBanner);
  const isMobile = useIsMobile();

  if (!banner?.isActive) return null;

  const webImage = banner.imageUrl?.trim();
  const mobileImage = banner.mobileIsActive !== false ? banner.mobileImageUrl?.trim() : '';

  // Pick the single image for the current device.
  const variant: 'web' | 'mobile' = isMobile ? 'mobile' : 'web';
  const src = isMobile ? mobileImage : webImage;
  if (!src) return null;

  const targetUrl = banner.targetUrl?.trim();
  const alt = banner.altText || 'Banner promocional';
  const classes = `promotional-banner-frame promotional-banner-frame--${variant}`;
  const img = <img src={src} alt={alt} loading="lazy" decoding="async" />;

  return (
    <section className={`promotional-banner-section ${className}`} aria-label={alt}>
      {targetUrl ? (
        <a
          className={classes}
          href={targetUrl}
          target={isExternalUrl(targetUrl) ? '_blank' : undefined}
          rel={isExternalUrl(targetUrl) ? 'noopener noreferrer' : undefined}
          aria-label={alt}
        >
          {img}
        </a>
      ) : (
        <div className={classes}>{img}</div>
      )}
    </section>
  );
}
