'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[App Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <AlertTriangle size={32} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Algo deu errado</h2>
      <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">
        Um erro inesperado ocorreu. Tente novamente — se persistir, reabra o app.
      </p>
      {error.digest && (
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white active:scale-95 transition"
      >
        <RefreshCw size={16} /> Tentar novamente
      </button>
    </div>
  );
}
