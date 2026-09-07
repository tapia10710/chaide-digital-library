import React, { useMemo } from 'react';
import EditorialHero from '../components/library/EditorialHero';
import PromotionalBanner from '../components/library/PromotionalBanner';
import { useStore } from '../store/useStore';
import { canViewDistributorDocument } from '../lib/distributorAccess';

export default function LibraryHome() {
  const { documents, role } = useStore();

  const readyDocuments = useMemo(
    () => documents.filter((doc) => (
      doc.status === 'ready' &&
      doc.isActive !== false &&
      canViewDistributorDocument(doc, role)
    )),
    [documents, role],
  );
  const uploadedDocuments = readyDocuments.filter((doc) =>
    doc.id.startsWith('upload-') || doc.fileUrl?.startsWith('/storage/')
  );
  const heroCandidates = uploadedDocuments.length > 0 ? uploadedDocuments : readyDocuments;
  const featured =
    heroCandidates.find((doc) => doc.isFeatured) ||
    [...heroCandidates].sort((a, b) => {
      const priorityA = a.priority ?? 999;
      const priorityB = b.priority ?? 999;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.order ?? 999) - (b.order ?? 999);
    })[0];
  return (
    <div className="library-home bg-[#f5f5f2]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", sans-serif' }}>
      {featured && <EditorialHero doc={featured} />}
      
      <div className="library-home-sections relative z-20">
        <PromotionalBanner />
      </div>
    </div>
  );
}
