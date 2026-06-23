import React from 'react';
import { useNavigate } from 'react-router-dom';

export type CatalogPreviewCardProps = {
  title: string;
  subtitle?: string;
  coverTitle?: string;
  year?: string;
  image: string;
  brandLabel?: string;
  onClick?: () => void;
  onHover?: () => void;
  href?: string;
  size?: "sm" | "md" | "lg";
  hideInfo?: boolean;
};

const CatalogPreviewCard: React.FC<CatalogPreviewCardProps> = ({
  title,
  subtitle,
  coverTitle,
  year,
  image,
  brandLabel = "CHAIDE BIBLIOTECA DIGITAL",
  onClick,
  onHover,
  href,
  size = "md",
  hideInfo = false,
}) => {
  const navigate = useNavigate();
  const displayYear = year || title.match(/\b20\d{2}\b/)?.[0] || String(new Date().getFullYear());

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    } else if (href) {
      e.preventDefault();
      navigate(href);
    }
  };

  const content = (
    <>
      <div className={`catalog-preview-cover catalog-preview-cover--${size}`}>
        <div className="catalog-preview-cover-top">
          <span>{coverTitle || title}</span>
        </div>

        <div className="catalog-preview-cover-image">
          <img src={image || '/placeholder.jpg'} alt={title} loading="lazy" decoding="async" />
        </div>

        <div className="catalog-preview-cover-footer">
          <strong>{displayYear}</strong>
          <small>{brandLabel}</small>
        </div>
      </div>

      {!hideInfo && (
        <div className="catalog-preview-info">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      )}
    </>
  );

  if (!href && !onClick) {
    return (
      <div className={`catalog-preview-card catalog-preview-card--${size}`}>
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className={`catalog-preview-card catalog-preview-card--${size}`}
      onClick={handleClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      onPointerDown={onHover}
    >
      {content}
    </a>
  );
};

export default CatalogPreviewCard;
