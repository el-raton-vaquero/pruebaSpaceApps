'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  badge: string;
  icon: string;
  pm: [number, number];
  f: [string, string][];
}

interface LandingHeroProps {
  objects: Record<string, AstronomicalObject>;
  onSelect: (key: string) => void;
  onSearch: (query: string) => void;
  onOpenConeSearch?: () => void;
  isSearching: boolean;
  searchMessage: string;
}

/** Dibuja una estrella PSF realista: núcleo puntual + espinas de difracción + halo. */
function drawPsfStar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  brightness: number,  // 0–1
  color: string = '#c8d4ff',
  spikes: boolean = true
) {
  const alpha = Math.min(1, brightness);

  // 1. Halo exterior (gradiente con caída rápida)
  const haloR = 10 + brightness * 10;
  const haloGr = g.createRadialGradient(x, y, 0, x, y, haloR);
  haloGr.addColorStop(0, `rgba(200,210,255,${0.18 * alpha})`);
  haloGr.addColorStop(0.4, `rgba(200,210,255,${0.07 * alpha})`);
  haloGr.addColorStop(1, 'rgba(200,210,255,0)');
  g.fillStyle = haloGr;
  g.beginPath();
  g.arc(x, y, haloR, 0, 2 * Math.PI);
  g.fill();

  // 2. Espinas de difracción (tipo telescopio espacial)
  if (spikes && brightness > 0.35) {
    const spikeLen = 8 + brightness * 14;
    g.strokeStyle = `rgba(230,238,255,${0.22 * alpha})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x - spikeLen, y); g.lineTo(x + spikeLen, y);
    g.moveTo(x, y - spikeLen); g.lineTo(x, y + spikeLen);
    g.stroke();
    // Espinas diagonales más tenues
    const d = spikeLen * 0.55;
    g.strokeStyle = `rgba(230,238,255,${0.1 * alpha})`;
    g.beginPath();
    g.moveTo(x - d, y - d); g.lineTo(x + d, y + d);
    g.moveTo(x + d, y - d); g.lineTo(x - d, y + d);
    g.stroke();
  }

  // 3. Núcleo puntual (1–2px)
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.beginPath();
  g.arc(x, y, brightness > 0.6 ? 1.5 : 1, 0, 2 * Math.PI);
  g.fill();
}

/** Mini canvas de 52×52 que muestra 2 fotogramas alternando (epoch 1 y epoch 4). */
function MiniCanvas({
  objKey,
  pm,
  type,
}: {
  objKey: string;
  pm: [number, number];
  type: 'mov' | 'pair' | 'var';
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    const W = 52;
    const H = 52;

    // Semilla estable por objeto
    const seed = objKey.charCodeAt(0) * 31 + objKey.length * 17;
    const rng = (s: number) => {
      let x = s;
      return () => {
        x = (x * 1664525 + 1013904223) & 0xffffffff;
        return (x >>> 0) / 0xffffffff;
      };
    };
    const r = rng(seed);
    const stars = Array.from({ length: 8 }, () => ({
      x: r() * W,
      y: r() * H,
      b: 0.25 + r() * 0.65,
    }));

    let frame = 0;
    let animId: number;
    let lastSwitch = performance.now();
    const INTERVAL = 650; // ms entre fotogramas

    const render = (now: number) => {
      if (now - lastSwitch > INTERVAL) {
        frame = 1 - frame;
        lastSwitch = now;
      }

      g.fillStyle = '#07090f';
      g.fillRect(0, 0, W, H);

      // Estrellas de fondo fijas
      stars.forEach((s) => {
        drawPsfStar(g, s.x, s.y, s.b * 0.7, '#c8d4ff', false);
      });

      // Objeto central
      const cx = W / 2;
      const cy = H / 2;
      const scale = 7;

      if (type === 'var') {
        const brightness = frame === 0 ? 0.9 : 0.35;
        drawPsfStar(g, cx, cy, brightness, '#ff9a7c', true);
      } else {
        const dx = pm[0] * scale * (frame === 0 ? -0.5 : 0.5);
        const dy = pm[1] * scale * (frame === 0 ? -0.5 : 0.5);

        if (type === 'pair') {
          drawPsfStar(g, cx + dx - 4, cy + dy - 2, 0.85, '#7ec8ff', true);
          drawPsfStar(g, cx + dx + 4, cy + dy + 2, 0.75, '#7ec8ff', true);
        } else {
          drawPsfStar(g, cx + dx, cy + dy, 0.9, '#ffd34f', true);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [objKey, pm, type]);

  return (
    <canvas
      ref={ref}
      width={52}
      height={52}
      className="sky-canvas"
      style={{
        width: 52,
        height: 52,
        borderRadius: 6,
        display: 'block',
        imageRendering: 'pixelated',
        background: '#07090f',
      }}
      aria-hidden="true"
    />
  );
}

/** Convierte tipo a etiqueta legible sin jerga */
function typeLabel(type: 'mov' | 'pair' | 'var'): string {
  if (type === 'var') return 'Cambia de brillo';
  if (type === 'pair') return 'Par en mov.';
  return 'En movimiento';
}

/** Valor de movimiento desde los facts del objeto */
function movValue(o: AstronomicalObject): string {
  const f = o.f.find(([k]) => k === 'Se mueve' || k === 'Movimiento' || k === 'Ciclo' || k === 'Cambia');
  return f ? f[1] : '';
}

/** ¿El objeto es rápido? (> 5″/año) */
function isFast(o: AstronomicalObject): boolean {
  const v = movValue(o);
  const m = v.match(/([\d,.]+)/);
  if (!m) return false;
  const n = parseFloat(m[1].replace(',', '.'));
  return n >= 5;
}

export function LandingHero({
  objects,
  onSelect,
  onSearch,
  onOpenConeSearch,
  isSearching,
  searchMessage,
}: LandingHeroProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [searchInput, setSearchInput] = useState('');

  /* ---- Hero canvas: fondo de cielo animado ---- */
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Detectar prefers-reduced-motion
    const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId: number;
    let t = 0;

    // Semilla fija para el fondo
    const stars = Array.from({ length: 55 }, (_, i) => ({
      x: ((i * 137.508) % 1) * 1200,
      y: ((i * 269.311) % 1) * 700,
      b: 0.18 + ((i * 31) % 100) / 200,
    }));

    // Objeto "estrella en movimiento" — simula WISE 0855
    const obj = { x0: 0.22, y0: 0.42, speed: 0.0028, amp: 30 };

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 1200;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();

    const render = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Fondo
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, W, H);

      // Viñeta
      const vign = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.9);
      vign.addColorStop(0, 'rgba(0,0,0,0)');
      vign.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, W, H);

      // Estrellas PSF
      stars.forEach((s) => {
        const sx = (s.x / 1200) * W;
        const sy = (s.y / 700) * H;
        drawPsfStar(ctx, sx, sy, s.b, '#c8d4ff', s.b > 0.3);
      });

      if (!noMotion) {
        // Objeto en movimiento (recorre el centro de la pantalla)
        t = (t + obj.speed) % 1.0;
        const mx = W * obj.x0 + t * W * 0.56;
        const my = H * obj.y0 + Math.sin(t * Math.PI) * obj.amp;

        // Rastro tenue
        ctx.strokeStyle = 'rgba(212,79,110,0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.moveTo(W * obj.x0, H * obj.y0);
        ctx.lineTo(W * (obj.x0 + 0.56), H * obj.y0);
        ctx.stroke();
        ctx.setLineDash([]);

        // Punto móvil con PSF color naranja/amarillo (infrarrojo)
        drawPsfStar(ctx, mx, my, 0.95, '#ffd34f', true);

        // Círculo de señalización (tenue)
        ctx.strokeStyle = 'rgba(255,211,79,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 14, 0, 2 * Math.PI);
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const obs = new ResizeObserver(resize);
    if (canvas.parentElement) obs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onSearch(searchInput.trim());
  };

  const entries = Object.entries(objects);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem 2rem',
        overflow: 'hidden',
      }}
    >
      {/* Cielo animado de fondo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        <canvas
          ref={bgCanvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        />
      </div>

      {/* Contenido principal */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 680,
        }}
      >
        {/* Referencia histórica (texto de apoyo — no "eyebrow") */}
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--mute)',
            fontSize: 'var(--text-caption)',
            marginBottom: '0.5rem',
            textAlign: 'center',
          }}
        >
          Así se descubrió Plutón: alternando dos fotos del mismo cielo.
        </p>

        {/* Headline: solo blanco, sin span de color */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-display)',
            color: 'var(--ink)',
            lineHeight: 1.12,
            margin: '0 0 0.75rem',
            textAlign: 'center',
            fontWeight: 400,
          }}
        >
          El cielo no está quieto.
          <br />
          Mira cómo se mueve.
        </h1>

        {/* Apoyo */}
        <p
          style={{
            color: 'var(--mute)',
            fontSize: 'var(--text-body)',
            textAlign: 'center',
            marginBottom: '2.5rem',
            lineHeight: 1.5,
          }}
        >
          Imágenes infrarrojas del telescopio SPHEREx de la NASA, tomadas en cuatro fechas
          distintas. Los objetos cercanos cruzan el cielo — los lejanos se quedan fijos.
        </p>

        {/* ===== ÍNDICE DE OBJETOS ===== */}
        <section
          aria-label="Objetos de ejemplo"
          style={{
            background: 'rgba(15,18,33,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            padding: '0.25rem 0.75rem',
            marginBottom: '1.75rem',
          }}
        >
          {/* Cabecera del índice */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr auto',
              gap: '0.875rem',
              padding: '0.4rem 0.5rem',
              borderBottom: '1px solid var(--line)',
              marginBottom: '0.1rem',
            }}
          >
            <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)' }}></span>
            <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', fontWeight: 600 }}>
              Objeto
            </span>
            <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', textAlign: 'right', fontWeight: 600 }}>
              Velocidad
            </span>
          </div>

          {entries.map(([k, o]) => {
            const mv = movValue(o);
            const fast = isFast(o);
            return (
              <button
                key={k}
                onClick={() => onSelect(k)}
                className="obj-row"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink)',
                }}
                aria-label={`Ver animación de ${o.n}: ${o.tag}`}
              >
                {/* Mini canvas animado */}
                <div className="obj-mini-canvas">
                  <MiniCanvas objKey={k} pm={o.pm} type={o.type} />
                </div>

                {/* Nombre + descripción + tipo */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      marginBottom: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {o.n}
                  </div>
                  <div
                    style={{
                      color: 'var(--mute)',
                      fontSize: 'var(--text-caption)',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginBottom: 4,
                    }}
                  >
                    {o.tag}
                  </div>
                  <span className={`type-tag ${o.type}`}>
                    {typeLabel(o.type)}
                  </span>
                </div>

                {/* Valor de movimiento */}
                <div>
                  {mv ? (
                    <span
                      className={`pm-value tabular${fast ? ' fast' : ''}`}
                      title={fast ? 'Objeto de alto movimiento propio' : ''}
                    >
                      {mv}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--mute)', fontSize: 'var(--text-data)' }}>—</span>
                  )}
                </div>
              </button>
            );
          })}
        </section>

        {/* Buscador */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 8 }}
          aria-label="Buscar objeto astronómico"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="O escribe un objeto (ej. Proxima Cen, 133.79 −7.24)…"
            style={{
              flex: 1,
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'rgba(15,18,33,0.9)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--acc)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
          />
          <button
            type="submit"
            disabled={isSearching}
            className="btn-primary"
          >
            {isSearching ? '…' : 'Buscar'}
          </button>
        </form>

        {/* Explorar alrededores */}
        {onOpenConeSearch && (
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={onOpenConeSearch}
              className="btn-ghost"
              style={{ fontSize: 'var(--text-caption)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              Explorar una zona del cielo por radio
            </button>
          </div>
        )}

        {/* Mensaje de búsqueda */}
        {searchMessage && (
          <p
            role="status"
            style={{
              color: 'var(--acc)',
              fontSize: 'var(--text-caption)',
              marginTop: 10,
              textAlign: 'center',
            }}
          >
            {searchMessage}
          </p>
        )}
      </div>
    </div>
  );
}
