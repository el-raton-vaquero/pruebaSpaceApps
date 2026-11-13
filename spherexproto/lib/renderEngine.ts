import { Frame, CatalogMarker, WCS, ContaminationFlag } from './types';
import { getColormapLut, applyStretch, COOLWARM_LUT } from './colormaps';
import { ConeResult } from './coneSearch';

export interface RenderEngineOptions {
  canvas: HTMLCanvasElement;
  frames: Frame[];
  epochFloat: number;             // 0.0 to 3.0 continuous float
  activeDetectors: boolean[];     // length 6
  mode: 'normal' | 'diff' | 'stack';
  diffRef: 'first' | 'previous';
  stretch: 'asinh' | 'log' | 'linear';
  colormap: 'inferno' | 'viridis' | 'greyscale';
  contrast: number;               // 30 to 100 slider
  highlight: boolean;
  targetName: string;
  targetType: 'mov' | 'pair' | 'var';
  wcs: WCS;
  fovArcmin: number;
  catalogMarkers?: CatalogMarker[];
  showCatalogOverlays?: boolean;
  coneResults?: ConeResult[];
  coneRadiusArcmin?: number;
  isConeSearchOpen?: boolean;
  showConeOverlays?: boolean;

  // Fase 3: Features estrella
  curtainEnabled?: boolean;
  curtainSplit?: number;          // 0.0 to 1.0
  autoHunterEnabled?: boolean;
  timeTravelGaiaWise?: boolean;
}

// Offscreen canvas for fast pixel rendering without layout thrashing
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreen(width: number, height: number) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }
  return { offCanvas: offscreenCanvas, offCtx: offscreenCtx! };
}

/**
 * Computes the 256x256 Float32 buffer depending on mode (normal, diff, stack)
 * and active detector filters.
 */
export function computeProcessedBuffer(
  frames: Frame[],
  epochIdx: number,
  activeDetectors: boolean[],
  mode: 'normal' | 'diff' | 'stack',
  diffRef: 'first' | 'previous'
): { buffer: Float32Array; flags: ContaminationFlag[] } | null {
  if (!frames || frames.length === 0) return null;

  const size = frames[0].width;
  const numPixels = size * size;

  // Detectors 1-indexed (1 to 6)
  const activeDets = activeDetectors
    .map((on, idx) => (on ? idx + 1 : null))
    .filter((d): d is number => d !== null);

  if (activeDets.length === 0) return null;

  const activeEpochFrames = frames.filter(
    (f) => f.epochIndex === epochIdx && activeDets.includes(f.detector)
  );

  const activeFlags = Array.from(
    new Set(activeEpochFrames.flatMap((f) => f.flags).filter((fl) => fl !== 'clean'))
  );

  // 1. STACK MODE: Co-add and average across all epochs and selected detectors
  if (mode === 'stack') {
    const stacked = new Float32Array(numPixels);
    let count = 0;

    frames.forEach((f) => {
      if (activeDets.includes(f.detector)) {
        const data = f.pixelData;
        for (let i = 0; i < numPixels; i++) {
          stacked[i] += data[i];
        }
        count++;
      }
    });

    if (count > 0) {
      for (let i = 0; i < numPixels; i++) stacked[i] /= count;
    }
    return { buffer: stacked, flags: [] };
  }

  // 2. DIFFERENCE MODE: I_diff = I_curr - I_ref
  if (mode === 'diff') {
    let refIdx = 0;
    if (diffRef === 'previous') {
      refIdx = Math.max(0, epochIdx - 1);
    }

    const currFrames = frames.filter(
      (f) => f.epochIndex === epochIdx && activeDets.includes(f.detector)
    );
    const refFrames = frames.filter(
      (f) => f.epochIndex === refIdx && activeDets.includes(f.detector)
    );

    if (currFrames.length === 0 || refFrames.length === 0) return null;

    const currComb = new Float32Array(numPixels);
    currFrames.forEach((f) => {
      const data = f.pixelData;
      for (let i = 0; i < numPixels; i++) currComb[i] += data[i];
    });
    for (let i = 0; i < numPixels; i++) currComb[i] /= currFrames.length;

    const refComb = new Float32Array(numPixels);
    refFrames.forEach((f) => {
      const data = f.pixelData;
      for (let i = 0; i < numPixels; i++) refComb[i] += data[i];
    });
    for (let i = 0; i < numPixels; i++) refComb[i] /= refFrames.length;

    const diff = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
      diff[i] = currComb[i] - refComb[i];
    }
    return { buffer: diff, flags: activeFlags };
  }

  // 3. NORMAL MODE: Average active detectors at current epoch
  if (activeEpochFrames.length === 0) return null;

  const normal = new Float32Array(numPixels);
  activeEpochFrames.forEach((f) => {
    const data = f.pixelData;
    for (let i = 0; i < numPixels; i++) normal[i] += data[i];
  });

  for (let i = 0; i < numPixels; i++) normal[i] /= activeEpochFrames.length;

  return { buffer: normal, flags: activeFlags };
}

/**
 * Main scientific rendering pipeline.
 * Renders Float32Array to 256x256 ImageData, blits to canvas, and overlays scientific vectors.
 */
export function renderScientificFrame(opts: RenderEngineOptions): {
  flags: ContaminationFlag[];
  activeEpochIdx: number;
} {
  const {
    canvas,
    frames,
    epochFloat,
    activeDetectors,
    mode,
    diffRef,
    stretch,
    colormap,
    contrast,
    highlight,
    targetName,
    targetType,
    wcs,
    fovArcmin,
    catalogMarkers = [],
    showCatalogOverlays = true,
    coneResults = [],
    coneRadiusArcmin = 10,
    isConeSearchOpen = false,
    showConeOverlays = true,
    curtainEnabled = false,
    curtainSplit = 0.5,
    autoHunterEnabled = false,
    timeTravelGaiaWise = true,
  } = opts;

  const g = canvas.getContext('2d');
  if (!g || !frames || frames.length === 0) {
    return { flags: [], activeEpochIdx: 0 };
  }

  const canvasWidth = canvas.width || 560;
  const canvasHeight = canvas.height || 560;
  const size = frames[0].width; // 256
  const scale = canvasWidth / size;

  // Current discrete epoch (0, 1, 2, 3)
  const epochIdx = Math.max(0, Math.min(3, Math.round(epochFloat)));

  // Offscreen buffer setup
  const { offCanvas, offCtx } = getOffscreen(size, size);
  const imgData = offCtx.createImageData(size, size);
  const data32 = new Uint32Array(imgData.data.buffer);
  const lut = mode === 'diff' ? COOLWARM_LUT : getColormapLut(colormap);
  const ctMultiplier = (contrast / 65.0);

  let activeFlags: ContaminationFlag[] = [];

  // =========================================================================
  // PIXEL RENDERING: CURTAIN (WIPE) VS STANDARD BUFFER
  // =========================================================================
  if (curtainEnabled) {
    // Curtain mode: Left side = Epoch 0 (Jun 2025), Right side = Epoch 3 (Dic 2026)
    const buf0 = computeProcessedBuffer(frames, 0, activeDetectors, 'normal', 'first');
    const buf3 = computeProcessedBuffer(frames, 3, activeDetectors, 'normal', 'first');

    if (buf0 && buf3) {
      const splitPx = Math.floor(size * curtainSplit);
      const minVal = 2.0;
      const maxVal = Math.max(25.0, 180.0 / ctMultiplier);

      for (let y = 0; y < size; y++) {
        const rowOffset = y * size;
        for (let x = 0; x < size; x++) {
          const idx = rowOffset + x;
          const v = x < splitPx ? buf0.buffer[idx] : buf3.buffer[idx];
          const stretched = applyStretch(v, minVal, maxVal, stretch);
          const lutIdx = Math.floor(Math.max(0, Math.min(1, stretched)) * 255);
          const c = lut[lutIdx] || lut[0];
          data32[idx] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
        }
      }
    }
  } else {
    // Normal / Diff / Stack buffer
    const processed = computeProcessedBuffer(frames, epochIdx, activeDetectors, mode, diffRef);
    if (!processed) {
      g.fillStyle = '#07090f';
      g.fillRect(0, 0, canvasWidth, canvasHeight);
      return { flags: [], activeEpochIdx: epochIdx };
    }

    const { buffer, flags } = processed;
    activeFlags = flags;

    if (mode === 'diff') {
      const maxVal = Math.max(15, 60.0 / ctMultiplier);
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        const norm = Math.max(0, Math.min(1, (v + maxVal) / (2 * maxVal)));
        const lutIdx = Math.floor(norm * 255);
        const c = lut[lutIdx] || lut[128];
        data32[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
      }
    } else {
      const minVal = 2.0;
      const maxVal = Math.max(25.0, 180.0 / ctMultiplier);
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        const stretched = applyStretch(v, minVal, maxVal, stretch);
        const lutIdx = Math.floor(Math.max(0, Math.min(1, stretched)) * 255);
        const c = lut[lutIdx] || lut[0];
        data32[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);

  // Blit offscreen buffer to display canvas with honest pixels
  g.imageSmoothingEnabled = false;
  g.drawImage(offCanvas, 0, 0, canvasWidth, canvasHeight);

  // =========================================================================
  // VECTOR OVERLAYS
  // =========================================================================

  // A. CORTINA COMPARADORA (Split Divider Line & Handles)
  if (curtainEnabled) {
    const splitX = canvasWidth * curtainSplit;

    // Vertical line
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(splitX, 0);
    g.lineTo(splitX, canvasHeight);
    g.stroke();

    // Center handle pill
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(splitX, canvasHeight / 2, 14, 0, 2 * Math.PI);
    g.fill();

    g.fillStyle = '#07090f';
    g.font = 'bold 12px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('↔', splitX, canvasHeight / 2);

    // Labels left & right
    g.fillStyle = 'rgba(7, 9, 15, 0.85)';
    g.fillRect(10, canvasHeight - 34, 110, 24);
    g.fillRect(canvasWidth - 120, canvasHeight - 34, 110, 24);

    g.fillStyle = '#ffd34f';
    g.font = '600 11px Inter, system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('Época 1 (Jun 2025)', 16, canvasHeight - 22);

    g.fillStyle = '#ff9a3c';
    g.textAlign = 'right';
    g.fillText('Época 4 (Dic 2026)', canvasWidth - 16, canvasHeight - 22);
  }

  // B. CAZADOR AUTOMÁTICO (Auto-Hunter Candidate Detector)
  if (autoHunterEnabled) {
    // Detect positive/negative dipole pair between Epoch 0 and Epoch 3
    const f0 = frames.find((f) => f.epochIndex === 0);
    const f3 = frames.find((f) => f.epochIndex === 3);

    if (f0 && f3 && f0.movingTargetPixel && f3.movingTargetPixel) {
      const p0 = f0.movingTargetPixel;
      const p3 = f3.movingTargetPixel;

      const pxDist = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const arcsecDist = pxDist * ((fovArcmin * 60.0) / size);

      const cx = ((p0.x + p3.x) / 2) * scale;
      const cy = ((p0.y + p3.y) / 2) * scale;
      const rBox = Math.max(26, (pxDist * scale) / 2 + 14);

      // Amber dashed detection box
      g.strokeStyle = '#facc15';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.arc(cx, cy, rBox, 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);

      // Auto-hunter tag
      g.fillStyle = 'rgba(7, 9, 15, 0.9)';
      g.fillRect(cx - 95, cy - rBox - 28, 190, 24);
      g.strokeStyle = '#facc15';
      g.strokeRect(cx - 95, cy - rBox - 28, 190, 24);

      g.fillStyle = '#facc15';
      g.font = 'bold 10px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('★ Candidato a objeto móvil', cx, cy - rBox - 16);

      // Displacement metric
      g.fillStyle = '#ffffff';
      g.font = '600 10px Inter, system-ui, sans-serif';
      g.fillText(`Desplazamiento: ${arcsecDist.toFixed(1)}″`, cx, cy + rBox + 14);
    }
  }

  // C. VIAJE EN EL TIEMPO CON OTROS TELESCOPIOS (Gaia 2016 -> WISE 2020 -> SPHEREx)
  if (timeTravelGaiaWise && highlight && catalogMarkers.length > 0 && targetType !== 'var') {
    const gaiaM = catalogMarkers.find((m) => m.catalog.includes('Gaia'));
    const wiseM = catalogMarkers.find((m) => m.catalog.includes('CatWISE'));

    const currF = frames.find((f) => f.epochIndex === epochIdx) || frames[0];
    const currPx = currF.movingTargetPixel || { x: size / 2, y: size / 2 };
    const sx = currPx.x * scale;
    const sy = currPx.y * scale;

    if (gaiaM) {
      const gx = gaiaM.pixelX * scale;
      const gy = gaiaM.pixelY * scale;

      // Draw dashed vector arrow from Gaia 2016 to current SPHEREx position
      g.strokeStyle = 'rgba(106, 167, 255, 0.6)';
      g.lineWidth = 1.5;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(sx, sy);
      g.stroke();
      g.setLineDash([]);

      // Calculate total arcsecond movement since Gaia 2016 (9.5 - 10.5 years)
      const elapsedY = 2026.0 - 2016.0;
      const pmRa = currF.movingTargetPixel ? ((targetName.includes('WISE') ? 8150 : 10362) / 1000.0) : 0;
      const totalMovedArcsec = (pmRa * elapsedY).toFixed(1);

      // Historical movement badge
      g.fillStyle = 'rgba(7, 9, 15, 0.88)';
      g.fillRect(12, canvasHeight - 34, 185, 22);
      g.strokeStyle = 'rgba(106, 167, 255, 0.4)';
      g.strokeRect(12, canvasHeight - 34, 185, 22);

      g.fillStyle = '#6aa7ff';
      g.font = '600 10px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`Desde 2016 se movió ~${totalMovedArcsec}″`, 18, canvasHeight - 23);
    }
  }

  // D. Search Radius Circle from Cone Search
  if (showConeOverlays && coneRadiusArcmin > 0 && (coneResults.length > 0 || isConeSearchOpen)) {
    const pxRadius = (coneRadiusArcmin / fovArcmin) * canvasWidth;
    if (pxRadius > 15) {
      g.strokeStyle = 'rgba(79, 209, 165, 0.45)';
      g.lineWidth = 1.5;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(canvasWidth / 2, canvasHeight / 2, pxRadius, 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);

      if (pxRadius > 35 && pxRadius < canvasWidth * 0.48) {
        g.fillStyle = 'rgba(79, 209, 165, 0.85)';
        g.font = '600 11px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Radio: ${coneRadiusArcmin}′`, canvasWidth / 2, Math.max(16, (canvasHeight / 2) - pxRadius - 6));
      }
    }
  }

  // E. Cone Search Numbered Result Markers
  if (showConeOverlays && coneResults.length > 0) {
    const cosDec = Math.cos((wcs.crval[1] * Math.PI) / 180.0);
    const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;
    const pxPerArcmin = canvasWidth / fovArcmin;

    coneResults.slice(0, 20).forEach((item) => {
      const dRaArcmin = (item.ra - wcs.crval[0]) * safeCosDec * 60.0;
      const dDecArcmin = (item.dec - wcs.crval[1]) * 60.0;
      const mx = (canvasWidth / 2) - dRaArcmin * pxPerArcmin;
      const my = (canvasHeight / 2) - dDecArcmin * pxPerArcmin;

      if (Math.hypot(mx - (canvasWidth / 2), my - (canvasHeight / 2)) < 16) return;

      if (mx >= 12 && mx <= canvasWidth - 12 && my >= 12 && my <= canvasHeight - 12) {
        g.strokeStyle = 'rgba(79, 209, 165, 0.9)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(mx, my, 11, 0, 2 * Math.PI);
        g.stroke();

        g.fillStyle = 'rgba(7, 9, 15, 0.92)';
        g.beginPath();
        g.arc(mx, my, 10, 0, 2 * Math.PI);
        g.fill();

        g.fillStyle = '#ffffff';
        g.font = 'bold 10px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(item.number), mx, my);

        g.fillStyle = '#4fd1a5';
        g.font = '600 10px Inter, system-ui, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        const shortName = item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name;
        g.fillText(shortName, mx + 14, my);
      }
    });
  }

  // F. Catalog Markers Cross-Identification (Gaia DR3 & CatWISE2020)
  if (showCatalogOverlays && highlight && catalogMarkers.length > 0) {
    catalogMarkers.forEach((m) => {
      const cx = m.pixelX * scale;
      const cy = m.pixelY * scale;

      if (cx >= 8 && cx <= canvasWidth - 8 && cy >= 8 && cy <= canvasHeight - 8) {
        const isGaia = m.catalog.includes('Gaia');
        const color = isGaia ? '#6aa7ff' : '#ff9a3c';

        g.strokeStyle = color;
        g.lineWidth = 1.5;

        g.beginPath();
        g.arc(cx, cy, 7, 0, 2 * Math.PI);
        g.stroke();

        g.beginPath();
        if (isGaia) {
          g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy);
          g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10);
        } else {
          g.moveTo(cx - 7, cy - 7); g.lineTo(cx + 7, cy + 7);
          g.moveTo(cx + 7, cy - 7); g.lineTo(cx - 7, cy + 7);
        }
        g.stroke();

        g.fillStyle = color;
        g.font = '600 10px Inter, system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText(isGaia ? 'Gaia DR3 (2016)' : 'WISE (2020)', cx + 11, cy + 3);
      }
    });
  }

  // G. Moving / Variable Target Tracking Indicator
  const f0 = frames.find((f) => f.epochIndex === 0)?.movingTargetPixel || { x: size / 2, y: size / 2 };
  const f3 = frames.find((f) => f.epochIndex === 3)?.movingTargetPixel || { x: size / 2, y: size / 2 };

  const interpT = epochFloat / 3.0;
  const interpX = (f0.x + (f3.x - f0.x) * interpT) * scale;
  const interpY = (f0.y + (f3.y - f0.y) * interpT) * scale;

  if (targetType === 'var') {
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    if (highlight) {
      g.strokeStyle = '#d44f6e';
      g.lineWidth = 2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.arc(cx, cy, 38, 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);

      g.fillStyle = '#f07a94';
      g.font = '600 14px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText(targetName, cx + 46, cy - 10);

      g.fillStyle = '#a8a4cb';
      g.font = '500 11px Inter, system-ui, sans-serif';
      g.fillText('Flujo variable en 4 épocas', cx + 46, cy + 6);
    }
  } else {
    if (highlight && !curtainEnabled) {
      g.strokeStyle = 'rgba(212, 79, 110, 0.6)';
      g.lineWidth = 1.5;
      g.setLineDash([4, 6]);
      g.beginPath();

      for (let ep = 0; ep < 4; ep++) {
        const epFrame = frames.find((f) => f.epochIndex === ep);
        const pt = epFrame?.movingTargetPixel || { x: size / 2, y: size / 2 };
        const px = pt.x * scale;
        const py = pt.y * scale;

        if (ep === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      g.setLineDash([]);

      for (let ep = 0; ep < 4; ep++) {
        const epFrame = frames.find((f) => f.epochIndex === ep);
        const pt = epFrame?.movingTargetPixel || { x: size / 2, y: size / 2 };
        const px = pt.x * scale;
        const py = pt.y * scale;

        g.fillStyle = ep === epochIdx ? '#d44f6e' : 'rgba(212, 79, 110, 0.35)';
        g.beginPath();
        g.arc(px, py, ep === epochIdx ? 4 : 2.5, 0, 2 * Math.PI);
        g.fill();
      }

      g.strokeStyle = '#d44f6e';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(interpX, interpY, targetType === 'pair' ? 32 : 24, 0, 2 * Math.PI);
      g.stroke();

      g.fillStyle = '#f07a94';
      g.font = '600 14px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText(targetName, interpX + 32, interpY - 14);

      if (mode === 'diff') {
        g.fillStyle = '#38bdf8';
        g.font = '500 11px Inter, system-ui, sans-serif';
        g.fillText('Par Dipolo (Cyan = Época ref / Rojo = Época actual)', interpX + 32, interpY + 4);
      }
    }
  }

  // H. Mode indicator watermarks
  if (mode === 'diff' && !curtainEnabled) {
    g.fillStyle = 'rgba(7, 9, 15, 0.85)';
    g.fillRect(canvasWidth - 165, 12, 153, 26);
    g.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    g.lineWidth = 1;
    g.strokeRect(canvasWidth - 165, 12, 153, 26);

    g.fillStyle = '#38bdf8';
    g.font = 'bold 11px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MODO DIFERENCIA (DIPOLO)', canvasWidth - 165 + 76, 25);
  } else if (mode === 'stack' && !curtainEnabled) {
    g.fillStyle = 'rgba(7, 9, 15, 0.85)';
    g.fillRect(canvasWidth - 155, 12, 143, 26);
    g.strokeStyle = 'rgba(250, 204, 21, 0.5)';
    g.lineWidth = 1;
    g.strokeRect(canvasWidth - 155, 12, 143, 26);

    g.fillStyle = '#facc15';
    g.font = 'bold 11px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MODO APILADO (CO-ADD)', canvasWidth - 155 + 71, 25);
  }

  return { flags: activeFlags, activeEpochIdx: epochIdx };
}
