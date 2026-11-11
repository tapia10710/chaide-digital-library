import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearDistributorAccess,
  DISTRIBUTOR_ACCESS_EVENT,
  hasDistributorAccess,
  isDistributorPasswordRequired,
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

  if (!isDistributorPasswordRequired() || !isProtectedLocation || (!active && role !== 'admin')) return null;

  return (
    <aside className="distributor-session-control protected-session-control" aria-label="Salida del catálogo de distribuidores">
      <button
        type="button"
        aria-label="Salir del catálogo de distribuidores"
        title="Salir del catálogo de distribuidores"
        onClick={() => {
          if (role !== 'admin') {
            clearDistributorAccess('manual');
            setActive(false);
          }
          navigate('/', { replace: true });
        }}
      >
        <LogOut aria-hidden="true" />
        Salir
      </button>
    </aside>
  );
}
