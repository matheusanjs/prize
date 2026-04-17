'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1.5rem',
        textAlign: 'center',
        background: '#0D1B2A',
        color: '#F4F9F9',
        margin: 0,
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Erro crítico</h2>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem', maxWidth: '20rem' }}>
          O app encontrou um problema. Reabra para continuar.
        </p>
        {error.digest && (
          <p style={{ fontSize: '0.625rem', opacity: 0.5, marginTop: '0.25rem' }}>
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: '1.25rem',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            background: '#E0A458',
            color: '#0D1B2A',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}
