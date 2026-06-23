import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import SidebarDrawer from './SidebarDrawer';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import { useStore } from '../../store/useStore';

export default function AppLayout() {
  const requestedCategoriesRef = useRef(false);
  const requestedPromotionalBannerRef = useRef(false);
  const requestedDocumentsModeRef = useRef<string | null>(null);
  const {
    isSidebarOpen,
    role,
    documents,
    categories,
    isLoadingDocs,
    hasLoadedDocs,
    fetchDocuments,
    fetchCategories,
    fetchPromotionalBanner,
    hasLoadedPromotionalBanner,
  } = useStore();

  useEffect(() => {
    if (!requestedCategoriesRef.current && categories.length === 0) {
      requestedCategoriesRef.current = true;
      fetchCategories();
    }

    if (!requestedPromotionalBannerRef.current && !hasLoadedPromotionalBanner) {
      requestedPromotionalBannerRef.current = true;
      fetchPromotionalBanner();
    }

    const documentsMode = role === 'admin' ? 'admin' : 'public';
    const shouldLoadDocuments =
      !isLoadingDocs &&
      !hasLoadedDocs &&
      documents.length === 0 &&
      requestedDocumentsModeRef.current !== documentsMode;

    if (shouldLoadDocuments) {
      requestedDocumentsModeRef.current = documentsMode;
      fetchDocuments(role === 'admin');
    }
  }, [
    categories.length,
    documents.length,
    fetchCategories,
    fetchDocuments,
    fetchPromotionalBanner,
    hasLoadedDocs,
    hasLoadedPromotionalBanner,
    isLoadingDocs,
    role,
  ]);

  return (
    <div className={`page-shell layout-with-sidebar ${isSidebarOpen ? 'sidebar-expanded' : ''}`}>
      <Header />
      <SidebarDrawer />
      
      <main className="main-content">
        <Outlet />
      </main>
      
      <MobileBottomNav />
    </div>
  );
}
