import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { ReactLenis } from 'lenis/react';
import AppLayout from './components/layout/AppLayout';
import { isStaticSite } from './lib/runtimeConfig';

const LibraryHome = lazy(() => import('./pages/LibraryHome'));
const ViewerPage = lazy(() => import('./pages/ViewerPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const AllCatalogsPage = lazy(() => import('./pages/AllCatalogsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-[#111]/50">
      <div className="w-8 h-8 rounded-full border-2 border-[#111]/15 border-t-[#111] animate-spin" />
    </div>
  );
}

function App() {
  const Router = isStaticSite ? HashRouter : BrowserRouter;

  return (
    <ReactLenis root>
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Main app wrapper with Sidebar */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<LibraryHome />} />
              <Route path="/admin" element={isStaticSite ? <Navigate to="/" replace /> : <AdminDashboard />} />
              <Route path="/buscar" element={<SearchResultsPage />} />
              <Route path="/categoria/:slug" element={<CategoryPage />} />
              <Route path="/categorias" element={<CategoriesPage />} />
              <Route path="/catalogos" element={<AllCatalogsPage />} />
              <Route path="/acerca-de" element={<AboutPage />} />
              <Route path="/viewer/:id" element={<ViewerPage />} />
            </Route>
            
            {/* Auth routes and standalone apps */}
            <Route path="/login" element={isStaticSite ? <Navigate to="/" replace /> : <LoginPage />} />
          </Routes>
        </Suspense>
      </Router>
    </ReactLenis>
  );
}

export default App;
