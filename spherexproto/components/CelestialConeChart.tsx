'use client';

import React, { useMemo, useState, useRef } from 'react';
import { ConeResult } from '../lib/coneSearch';

interface CelestialConeChartProps {
  centerRa: number;
  centerDec: number;
  radiusArcmin: number;
  results: ConeResult[];
  hoveredId: string | null;
  onHoverId: (id: string | null) => void;
  onSelectResult: (result: ConeResult) => void;
  onSelectNewCenter?: (coords: { ra: number; dec: number }) => void;
}

export function CelestialConeChart({
  centerRa,
  centerDec,
  radiusArcmin,
  results,
  hoveredId,
  onHoverId,
  onSelectResult,
  onSelectNewCenter,
}: CelestialConeChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverCursor, setHoverCursor] = useState<{ px: number; py: number; ra: number; dec: number } | null>(null);

  // Chart dimensions
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const rPx = 110; // Pixel radius for the search cone boundary

  // Scale: pixels per arcmin
  const scale = rPx / Math.max(1, radiusArcmin);
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const px = (mouseX / rect.width) * size;
    const py = (mouseY / rect.height) * size;
    const dist = Math.hypot(px - cx, py - cy);

    if (dist <= rPx) {
      setHoverCursor((prev) => {
        if (prev && Math.hypot(prev.px - px, prev.py - py) < 2) {
          return prev;
        }
        const dRaArcmin = (px - cx) / scale;
        const dDecArcmin = (cy - py) / scale;
        const dRaDeg = dRaArcmin / (60.0 * Math.max(0.01, cosDec));
        const dDecDeg = dDecArcmin / 60.0;
        const cursorRa = centerRa - dRaDeg;
        const cursorDec = centerDec + dDecDeg;
        return { px, py, ra: cursorRa, dec: cursorDec };
      });
    } else {
      setHoverCursor((prev) => (prev !== null ? null : prev));
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hoverCursor || !onSelectNewCenter) return;
    const target = e.target as SVGElement;
    if (target.getAttribute('data-point') === 'true') return;
    onSelectNewCenter({ ra: hoverCursor.ra, dec: hoverCursor.dec });
  };

  // Compute 2D projected pixel positions (East on left: -x, North up: +y)
  const mappedPoints = useMemo(() => {
    return results.map((item) => {
      // Angular separation in arcminutes relative to center
      // In astronomy: East is left (increasing RA), so dRa > 0 projects to the left (-x)
      const dRaArcmin = (centerRa - item.ra) * cosDec * 60.0;
      const dDecArcmin = (item.dec - centerDec) * 60.0;

      const px = cx + dRaArcmin * scale;
      const py = cy - dDecArcmin * scale;

      // Color scheme based on astrophysical category
      let color = '#94a3b8'; // Slate/Gray: Common star
      if (item.isColdCandidate) {
        color = '#38bdf8'; // Cyan: Cold candidate ("Lo que Gaia no ve")
      } else if (item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.kindCode.startsWith('TT')) {
        color = '#fbbf24'; // Yellow/Amber: Variable star
      } else if (item.pmArcsecPerYear >= 0.20 || item.kindCode.startsWith('PM')) {
        color = '#f43f5e'; // Magenta/Rose: Fast proper motion
      } else if (item.kindCode.startsWith('BD')) {
        color = '#a855f7'; // Purple: Brown dwarf
      }

      // Proper motion vector displacement in pixels (for visual arrow)
      let pmVector: { vx: number; vy: number; len: number } | null = null;
      if (item.pmArcsecPerYear >= 0.04 && item.sepArcsec > 0) {
        const pmRaArcmin = (item.pmRa / 1000.0 / 60.0) * 12.0; // scaled travel vector
        const pmDecArcmin = (item.pmDec / 1000.0 / 60.0) * 12.0;
        const vx = -pmRaArcmin * scale;
        const vy = -pmDecArcmin * scale;
        const len = Math.hypot(vx, vy);
        if (len > 3) {
          const clampedLen = Math.min(28, Math.max(8, len));
          const norm = clampedLen / len;
          pmVector = { vx: vx * norm, vy: vy * norm, len: clampedLen };
        }
      }

      return {
        ...item,
        px,
        py,
        color,
        pmVector,
        isCenter: item.sepArcsec === 0,
      };
    });
  }, [results, centerRa, centerDec, cosDec, scale, cx, cy]);

  return (
    <div className="relative w-full flex flex-col items-center bg-[#070914] border border-[#272a4f] rounded-2xl p-3 select-none">
      <div className="w-full flex items-center justify-between text-[11px] text-[#9a95b8] mb-1 font-mono">
        <span className="flex items-center gap-1.5 font-bold text-white">
          <span className="w-2 h-2 rounded-full bg-[#ff5a7e] animate-pulse" />
          Carta Celeste ({radiusArcmin}′)
        </span>
        <span className="text-[10px]">
          Norte ↑ · Este ←
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHoverCursor((prev) => (prev !== null ? null : prev))}
        onClick={handleSvgClick}
        className="w-full max-w-[260px] h-auto aspect-square overflow-visible cursor-crosshair"
      >
        <defs>
          {/* Glowing filter for hovered point */}
          <filter id="cone-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Marker arrowhead for proper motion vectors */}
          <marker
            id="pm-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ff5a7e" opacity="0.85" />
          </marker>
        </defs>

        {/* 1. Coordinate Grid & Concentric Range Rings */}
        {/* Outer Cone Boundary */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx}
          fill="#0c1026"
          stroke="#383b63"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* 2/3 Radius Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx * 0.666}
          fill="none"
          stroke="#1e224d"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* 1/3 Radius Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx * 0.333}
          fill="none"
          stroke="#1e224d"
          strokeWidth="1"
        />

        {/* Crosshair Axes (N-S and E-W) */}
        <line x1={cx} y1={cy - rPx} x2={cx} y2={cy + rPx} stroke="#1f2450" strokeWidth="1" />
        <line x1={cx - rPx} y1={cy} x2={cx + rPx} y2={cy} stroke="#1f2450" strokeWidth="1" />

        {/* Astronomical Compass Directions */}
        <text x={cx} y={15} fill="#6366f1" fontSize="9" fontWeight="bold" textAnchor="middle">
          N
        </text>
        <text x={14} y={cy + 3} fill="#6366f1" fontSize="9" fontWeight="bold" textAnchor="middle">
          E
        </text>
        <text x={cx} y={size - 5} fill="#9a95b8" fontSize="8" textAnchor="middle">
          S
        </text>
        <text x={size - 12} y={cy + 3} fill="#9a95b8" fontSize="8" textAnchor="middle">
          O
        </text>

        {/* Distance label on ring */}
        <text x={cx + rPx * 0.666 - 2} y={cy - 4} fill="#4b5585" fontSize="7" fontFamily="monospace">
          {(radiusArcmin * 0.666).toFixed(0)}′
        </text>

        {/* Center Reticle Pin (Gold target marker) */}
        <circle cx={cx} cy={cy} r={3.5} fill="#ffd34f" stroke="#fff" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={7} fill="none" stroke="#ffd34f" strokeWidth="0.8" opacity="0.6" />

        {/* 2. Proper Motion Vector Arrows */}
        {mappedPoints.map((item) => {
          if (!item.pmVector) return null;
          return (
            <line
              key={`pm-${item.id}`}
              x1={item.px}
              y1={item.py}
              x2={item.px + item.pmVector.vx}
              y2={item.py + item.pmVector.vy}
              stroke="#ff5a7e"
              strokeWidth="1.5"
              markerEnd="url(#pm-arrow)"
              opacity={hoveredId === item.id ? 1 : 0.65}
            />
          );
        })}

        {/* 3. Catalog Star / Object Points */}
        {mappedPoints.map((item) => {
          const isHovered = hoveredId === item.id;
          const radius = item.isCenter ? 5 : Math.max(3, Math.min(6, 2.5 + item.interestScore / 25));

          return (
            <g
              key={item.id}
              className="cursor-pointer transition-transform duration-150"
              onMouseEnter={() => onHoverId(item.id)}
              onMouseLeave={() => onHoverId(null)}
              onClick={() => onSelectResult(item)}
            >
              {/* Luminous Pulsing Halo on Hover */}
              {isHovered && (
                <circle
                  cx={item.px}
                  cy={item.py}
                  r={radius + 6}
                  fill={item.color}
                  fillOpacity="0.3"
                  stroke={item.color}
                  strokeWidth="1.5"
                  filter="url(#cone-glow)"
                />
              )}

              {/* Point Body */}
              <circle
                data-point="true"
                cx={item.px}
                cy={item.py}
                r={radius}
                fill={item.color}
                stroke="#fff"
                strokeWidth={isHovered ? 1.5 : 0.75}
              />

              {/* Index Number Label */}
              <text
                x={item.px + (item.px > cx ? -7 : 7)}
                y={item.py - 5}
                fill={isHovered ? '#fff' : '#cbd5e1'}
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor={item.px > cx ? 'end' : 'start'}
                className="pointer-events-none drop-shadow"
              >
                {item.number}
              </text>
            </g>
          );
        })}

        {/* 4. Crosshair Reticle on Empty Space Hover ("Buscar aquí") */}
        {hoverCursor && !hoveredId && (
          <g className="pointer-events-none">
            <line
              x1={hoverCursor.px - 6}
              y1={hoverCursor.py}
              x2={hoverCursor.px + 6}
              y2={hoverCursor.py}
              stroke="#ff5a7e"
              strokeWidth="1.2"
            />
            <line
              x1={hoverCursor.px}
              y1={hoverCursor.py - 6}
              x2={hoverCursor.px}
              y2={hoverCursor.py + 6}
              stroke="#ff5a7e"
              strokeWidth="1.2"
            />
            <circle
              cx={hoverCursor.px}
              cy={hoverCursor.py}
              r={4}
              fill="none"
              stroke="#ff5a7e"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <rect
              x={hoverCursor.px - 32}
              y={hoverCursor.py + 7}
              width={64}
              height={14}
              rx={3}
              fill="#0b0d1c"
              fillOpacity="0.85"
              stroke="#ff5a7e"
              strokeWidth="0.8"
            />
            <text
              x={hoverCursor.px}
              y={hoverCursor.py + 17}
              fill="#ff5a7e"
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              Buscar aquí
            </text>
          </g>
        )}
      </svg>

      {/* Interactive tip */}
      <p className="text-[10px] text-[#716e89] mt-1 text-center font-mono">
        💡 Clic en un punto vacío para reubicar el centro
      </p>

      {/* Chart Legend */}
      <div className="w-full flex items-center justify-center gap-3 mt-2 text-[10px] text-[#9a95b8] font-mono flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
          Frío / WISE
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#f43f5e]" />
          Rápido (PM)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#fbbf24]" />
          Variable
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#94a3b8]" />
          Estrella
        </span>
      </div>
    </div>
  );
}
