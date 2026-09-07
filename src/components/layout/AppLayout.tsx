import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import SidebarDrawer from './SidebarDrawer';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import CatalogAssistant from '../assistant/CatalogAssistant';
import DistributorSessionControl from '../access/DistributorSessionControl';
import { useStore } from '../../store/useStore';
import { isFirebaseSite } from '../../lib/runtimeConfig';

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
    syncDocuments,
    setDocumentsSyncStatus,
  } = useStore();

  useEffect(() => {
    if (!isFirebaseSite) return undefined;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    setDocumentsSyncStatus('syncing');

    void import('../../lib/firebaseCatalog')
      .then(({ subscribeFirebaseDocuments }) => subscribeFirebaseDocuments(
        role === 'admin',
        (nextDocuments) => {
          if (!disposed) syncDocuments(nextDocuments);
        },
        () => {
          if (!disposed) setDocumentsSyncStatus('error');
        },
      ))
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch(() => {
        if (!disposed) {
          setDocumentsSyncStatus('error');
          void fetchDocuments(role === 'admin');
        }
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [role, setDocumentsSyncStatus, syncDocuments]);

  useEffect(() => {
    if (!requestedCategoriesRef.current && categories.length === 0) {
      requestedCategoriesRef.current = true;
      fetchCategories(role === 'admin');
    }

    if (!requestedPromotionalBannerRef.current && !hasLoadedPromotionalBanner) {
      requestedPromotionalBannerRef.current = true;
      fetchPromotionalBanner();
    }

    const documentsMode = role === 'admin' ? 'admin' : 'public';
    const shouldLoadDocuments =
      !isFirebaseSite &&
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
      <CatalogAssistant />
      <DistributorSessionControl />
    </div>
  );
}
