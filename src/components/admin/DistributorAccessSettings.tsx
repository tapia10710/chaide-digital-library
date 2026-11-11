import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function DistributorAccessSettings() {
  const [required, setRequired] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => onSnapshot(doc(db, 'settings', 'distributor-access'), snapshot => {
    setRequired(snapshot.data()?.passwordRequired !== false);
  }, () => {
    setRequired(null);
    setMessage('No se pudo cargar la configuración de acceso.');
  }), []);

  async function changeAccess(next: boolean) {
    setSaving(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'settings', 'distributor-access'), {
        passwordRequired: next,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage(next ? 'La clave está habilitada.' : 'La clave está deshabilitada.');
    } catch {
      setMessage('No se pudo guardar el cambio. Inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#111827] p-6" aria-labelledby="distributor-access-settings-title">
      <h2 id="distributor-access-settings-title" className="text-lg font-semibold">Clave de Distribuidores</h2>
      <p className="mt-2 text-sm text-gray-300">Elige si los visitantes deben ingresar la clave para ver esta sección. El cambio aplica a esta biblioteca.</p>
      <p className="mt-2 text-xs text-gray-400">Este control es una barrera visual. Los PDF publicados conservan el acceso público directo.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm">{required === null ? 'Consultando estado…' : required ? 'Clave habilitada' : 'Clave deshabilitada'}</span>
        <button type="button" disabled={required === null || saving} onClick={() => void changeAccess(!required)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : required ? 'Deshabilitar clave' : 'Habilitar clave'}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-gray-300">{message}</p>}
    </section>
  );
}
