import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearDistributorAccess,
  DISTRIBUTOR_ACCESS_EVENT,
  DISTRIBUTOR_ACCESS_TIMEOUT_MS,
  hasDistributorAccess,
  isDistributorCategory,
  isDistributorDocument,
  refreshDistributorAccess,
} from '../../lib/distributorAccess';
import { useStore } from '../../store/useStore';

const ACTIVITY_REFRESH_INTERVAL_MS = 30_000;
const ACCESS_CHECK_INTERVAL_MS = 10_000;

export default function DistributorSessionControl() {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, role } = useStore();
  const [active, setActive] = useState(() => hasDistributorAccess());
  const lastRefreshRef = useRef(0);

  const isProtectedLocation = useMemo(() => {
    if (isDistributorCategory(location.pathname.split('/categoria/')[1])) return true;
    const viewerMatch = location.pathname.match(/^\/viewer\/([^/]+)/);
    if (!viewerMatch) return false;
    const documentId = decodeURIComponent(viewerMatch[1]);
    return isDistributorDocument(documents.find((document) => document.id === documentId));
  }, [documents, location.pathname]);

  useEffect(() => {
    const onAccessChange = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      const nextActive = hasDistributorAccess();
      setActive(nextActive);
      if (!nextActive && reason === 'expired' && isProtectedLocation) {
        navigate('/categoria/catalogo-de-distribuidores', { replace: true });
      }
    };
    window.addEventListener(DISTRIBUTOR_ACCESS_EVENT, onAccessChange);
    return () => window.removeEventListener(DISTRIBUTOR_ACCESS_EVENT, onAccessChange);
  }, [isProtectedLocation, navigate]);

  useEffect(() => {
    if (!active || role === 'admin') return undefined;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < ACTIVITY_REFRESH_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      if (!refreshDistributorAccess()) setActive(false);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    const interval = window.setInterval(() => {
      if (!hasDistributorAccess()) setActive(false);
    }, ACCESS_CHECK_INTERVAL_MS);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.clearInterval(interval);
    };
  }, [active, role]);

  if (!active || role === 'admin') return null;

  const minutes = Math.round(DISTRIBUTOR_ACCESS_TIMEOUT_MS / 60_000);

  return (
    <aside className="distributor-session-control" aria-label="Sesión de visualización de distribuidores">
      <span className="distributor-session-status" title={`Se cerrará después de ${minutes} minutos sin actividad`}>
        <Clock3 aria-hidden="true" />
        Acceso de distribuidores
      </span>
      <button
        type="button"
        onClick={() => {
          clearDistributorAccess('manual');
          setActive(false);
          navigate('/', { replace: true });
        }}
      >
        <LogOut aria-hidden="true" />
        Salir
      </button>
    </aside>
  );
}
