'use client';

import React from 'react';

interface RetoModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: {
    n: string;
    hook: string;
    f: [string, string][];
  };
  found: boolean;
  score: number;
}

export function RetoModal({ isOpen, onClose, target, found, score }: RetoModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reto-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(7, 9, 15, 0.82)',
        backdropFilter: 'blur(8px)',
      }}
      className="animate-pop"
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          backgroundColor: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          color: 'var(--ink)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(212, 79, 110, 0.2)',
                color: 'var(--acc-hi)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h3
                id="reto-title"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  fontWeight: 400,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                Reto Detective Celeste
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-data)', color: 'var(--mute)' }}>
                Verificación de predicción por movimiento propio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--panel-raised)',
              border: '1px solid var(--line)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-data)',
                fontWeight: 700,
                color: 'var(--acc-hi)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Tu Misión:
            </span>
            <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
              Localiza a <span style={{ color: 'var(--acc-hi)' }}>{target.n}</span> haciendo clic directamente sobre él en el visor.
            </p>
          </div>

          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--acc)', fontWeight: 700 }}>1.</span>
              <span>Usa el deslizador de tiempo o la tecla <b>B</b> (parpadeo) para detectar el salto de posición.</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--acc)', fontWeight: 700 }}>2.</span>
              <span>Compara con la retícula predicha por las mediciones de Gaia DR3.</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--acc)', fontWeight: 700 }}>3.</span>
              <span>Haz clic sobre el astro móvil para medir la precisión angular del hallazgo.</span>
            </div>
          </div>

          {/* Status Badge */}
          <div
            style={{
              padding: '12px',
              borderRadius: 10,
              border: `1px solid ${found ? '#4fd1a5' : 'var(--line)'}`,
              backgroundColor: found ? 'rgba(79, 209, 165, 0.1)' : 'var(--panel-raised)',
              textAlign: 'center',
            }}
          >
            {found ? (
              <div style={{ color: '#4fd1a5', fontWeight: 700, fontSize: 'var(--text-caption)' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: 2 }}>✓ ¡Objetivo Confirmado!</div>
                <div>Error angular menor a 0,8″. Ganaste +100 puntos (Total: {score} pts)</div>
              </div>
            ) : (
              <div style={{ color: 'var(--acc-hi)', fontSize: 'var(--text-caption)', fontWeight: 600 }}>
                Haz clic sobre el objeto en movimiento en el visor para confirmar…
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            {found ? 'Seguir explorando' : 'Entendido, volver al visor'}
          </button>
        </div>
      </div>
    </div>
  );
}
