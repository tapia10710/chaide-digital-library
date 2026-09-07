import React from 'react';
import { Home, Info } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="mobile-bottom-nav">
      <button
        className={`mobile-nav-item ${location.pathname === '/' ? 'active' : ''}`}
        onClick={() => navigate('/')}
      >
        <Home size={24} />
        <span>Inicio</span>
      </button>

      <button
        className={`mobile-nav-item ${location.pathname === '/acerca-de' ? 'active' : ''}`}
        onClick={() => navigate('/acerca-de')}
      >
        <Info size={24} />
        <span>Acerca de</span>
      </button>
    </nav>
  );
}
