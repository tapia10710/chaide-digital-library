import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearCreditAccess,
  CREDIT_ACCESS_EVENT,
  hasCreditAccess,
  isCreditCategory,
  isCreditDocument,
  refreshCreditAccess,
} from '../../lib/creditAccess';
import { useStore } from '../../store/useStore';

const ACTIVITY_REFRESH_INTERVAL_MS = 30_000;
const ACCESS_CHECK_INTERVAL_MS = 10_000;

export default function CreditSessionControl() {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, role } = useStore();
  const [active, setActive] = useState(() => hasCreditAccess());
  const lastRefreshRef = useRef(0);

  const isProtectedLocation = useMemo(() => {
    if (isCreditCategory(location.pathname.split('/categoria/')[1])) return true;
    const viewerMatch = location.pathname.match(/^\/viewer\/([^/]+)/);
    if (!viewerMatch) return false;
    const documentId = decodeURIComponent(viewerMatch[1]);
    return isCreditDocument(documents.find((document) => document.id === documentId));
  }, [documents, location.pathname]);

  useEffect(() => {
    const onAccessChange = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      const nextActive = hasCreditAccess();
      setActive(nextActive);
      if (!nextActive && reason === 'expired' && isProtectedLocation) {
        navigate('/categoria/credito', { replace: true });
      }
    };
    window.addEventListener(CREDIT_ACCESS_EVENT, onAccessChange);
    return () => window.removeEventListener(CREDIT_ACCESS_EVENT, onAccessChange);
  }, [isProtectedLocation, navigate]);

  useEffect(() => {
    if (!active || role === 'admin') return undefined;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < ACTIVITY_REFRESH_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      if (!refreshCreditAccess()) setActive(false);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    const interval = window.setInterval(() => {
      if (!hasCreditAccess()) setActive(false);
    }, ACCESS_CHECK_INTERVAL_MS);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.clearInterval(interval);
    };
  }, [active, role]);

  if (!isProtectedLocation || (!active && role !== 'admin')) return null;

  return (
    <aside className="distributor-session-control protected-session-control" aria-label="Salida del historial de precios">
      <button
        type="button"
        aria-label="Salir del historial de precios"
        title="Salir del historial de precios"
        onClick={() => {
          if (role !== 'admin') {
            clearCreditAccess('manual');
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
