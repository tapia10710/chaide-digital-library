import React, { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DISTRIBUTOR_ACCESS_EVENT,
  grantDistributorAccess,
  hasDistributorAccess,
  verifyDistributorPassword,
} from '../../lib/distributorAccess';

interface DistributorAccessGateProps {
  children: ReactNode;
  bypass?: boolean;
  onGranted?: () => void;
}

export default function DistributorAccessGate({ children, bypass = false, onGranted }: DistributorAccessGateProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [granted, setGranted] = useState(() => bypass || hasDistributorAccess());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (bypass && !granted) setGranted(true);
  }, [bypass, granted]);

  useEffect(() => {
    if (!granted) inputRef.current?.focus();
  }, [granted]);

  useEffect(() => {
    const syncAccess = () => setGranted(bypass || hasDistributorAccess());
    window.addEventListener(DISTRIBUTOR_ACCESS_EVENT, syncAccess);
    return () => window.removeEventListener(DISTRIBUTOR_ACCESS_EVENT, syncAccess);
  }, [bypass]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password.trim() || checking) return;
    setChecking(true);
    setError('');
    try {
      if (!(await verifyDistributorPassword(password))) {
        setError('La clave ingresada no es correcta.');
        setPassword('');
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      grantDistributorAccess();
      setGranted(true);
      onGranted?.();
    } finally {
      setChecking(false);
    }
  }

  if (granted) return <>{children}</>;

  return (
    <main className="distributor-access-page" aria-labelledby="distributor-access-title">
      <section className="distributor-access-card">
        <div className="distributor-access-icon"><LockKeyhole aria-hidden="true" /></div>
        <span className="distributor-access-eyebrow">ACCESO DE VISUALIZACIÓN</span>
        <h1 id="distributor-access-title">Catálogo de Distribuidores</h1>
        <p>Ingresa la clave general para consultar la lista y visualizar sus documentos.</p>
        <form onSubmit={submit}>
          <label htmlFor="distributor-access-password">Clave de ingreso</label>
          <div className="distributor-access-input">
            <input
              ref={inputRef}
              id="distributor-access-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(''); }}
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'distributor-access-error' : undefined}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {error ? <span id="distributor-access-error" className="distributor-access-error" role="alert">{error}</span> : null}
          <button className="distributor-access-submit" type="submit" disabled={!password.trim() || checking}>{checking ? 'Comprobando…' : 'Ingresar'}</button>
        </form>
        <button className="distributor-access-back" type="button" onClick={() => navigate('/')}><ArrowLeft aria-hidden="true" /> Volver al inicio</button>
      </section>
    </main>
  );
}
