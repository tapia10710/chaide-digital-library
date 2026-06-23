import React from 'react';
import { Menu, Search, User as UserIcon, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { isStaticSite } from '../../lib/runtimeConfig';

export default function Header() {
  const { toggleSidebar, searchQuery, setSearchQuery, role, user, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      setSearchQuery(trimmedQuery);
      navigate(`/buscar?q=${encodeURIComponent(trimmedQuery)}`);
    }
  };

  const isViewerPage = location.pathname.startsWith('/viewer');
  const isSearchPage = location.pathname === '/buscar';

  return (
    <header className="library-header">
      <div className="library-header-main">
        <div className="library-header-left">
          <button 
            onClick={toggleSidebar}
            className="header-menu-button desktop-only"
            title="Menú"
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>
          <a href="/" className="library-logo" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <strong>Chaide</strong>
            <span>Biblioteca Digital</span>
          </a>
        </div>

        <nav className="library-nav" aria-label="Navegación principal">
          <a href="/catalogos" onClick={(e) => { e.preventDefault(); navigate('/catalogos'); }}>Catálogos</a>
        </nav>

        <div className="library-actions">
          {!isSearchPage && !isViewerPage && (
            <form onSubmit={handleSearch} className="catalog-search desktop-search">
              <input 
                type="search" 
                placeholder="Buscar catálogos..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" style={{ background: 'transparent', border: 'none', display: 'flex', justifyContent: 'center', cursor: 'pointer' }} aria-label="Buscar">
                <Search className="catalog-search-icon" size={18} />
              </button>
            </form>
          )}

          {role === 'admin' && (
            <button 
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-black/80 transition-all mr-2"
            >
              <Settings size={14} />
              <span className="hidden md:inline">Admin</span>
            </button>
          )}

          {!isStaticSite && <button 
            onClick={user ? handleLogout : () => navigate('/login')}
            className="user-button"
            aria-label={user ? "Cerrar sesión" : "Iniciar sesión"}
            title={user ? "Cerrar sesión" : "Iniciar sesión"}
          >
            <div className="flex items-center gap-2">
              <UserIcon size={18} />
              {user && <span className="text-xs font-medium hidden md:block">Salir ({user.name.split(' ')[0]})</span>}
            </div>
          </button>}
        </div>
      </div>
      
      {/* Mobile only search bar below the top bar */}
      {!isSearchPage && !isViewerPage && (
        <div className="mobile-search-container">
          <form onSubmit={handleSearch} className="catalog-search-mobile">
            <button type="submit" className="catalog-search-icon-button-mobile" aria-label="Buscar">
              <Search className="catalog-search-icon-mobile" size={18} />
            </button>
            <input 
              type="search" 
              placeholder="Buscar catálogos..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>
      )}
    </header>
  );
}
