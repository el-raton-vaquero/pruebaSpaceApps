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
    g.arc(splitX, canvasHeight / 2, 12, 0, 2 * Math.PI);
    g.fill();

    // Líneas de agarre mecánicas (sin emojis)
    g.strokeStyle = '#0c0d12';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(splitX - 3, canvasHeight / 2 - 5); g.lineTo(splitX - 3, canvasHeight / 2 + 5);
    g.moveTo(splitX + 3, canvasHeight / 2 - 5); g.lineTo(splitX + 3, canvasHeight / 2 + 5);
    g.stroke();

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

      // Detection ring in alert color
      g.strokeStyle = '#ff6b35';
      g.lineWidth = 1.8;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc(cx, cy, rBox, 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);

      // Cross-match with cone candidates
      const matchingCandidate = coneResults.find(
        (c) => c.pmArcsecPerYear > 0.05 || c.isColdCandidate
      );
      const tagText = matchingCandidate
        ? `Candidato: coincide con ${matchingCandidate.name} (${matchingCandidate.kindLabel})`
        : 'Candidato a objeto en movimiento';

      const tagWidth = Math.max(170, tagText.length * 6.2);
      g.fillStyle = 'rgba(10, 11, 16, 0.92)';
      g.fillRect(cx - tagWidth / 2, cy - rBox - 26, tagWidth, 22);
      g.strokeStyle = '#ff6b35';
      g.lineWidth = 1;
      g.strokeRect(cx - tagWidth / 2, cy - rBox - 26, tagWidth, 22);

      g.fillStyle = '#ff6b35';
      g.font = '600 10px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(tagText, cx, cy - rBox - 15);

      // Displacement metric
      g.fillStyle = 'rgba(255, 255, 255, 0.9)';
      g.font = '500 10px Inter, system-ui, sans-serif';
      g.fillText(`Desplazamiento dipolo: ~${arcsecDist.toFixed(1)}″`, cx, cy + rBox + 14);
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

    const gx = gaiaM ? gaiaM.pixelX * scale : null;
    const gy = gaiaM ? gaiaM.pixelY * scale : null;
    const wx = wiseM ? wiseM.pixelX * scale : null;
    const wy = wiseM ? wiseM.pixelY * scale : null;

    // Draw dashed flight path from historical epochs to SPHEREx
    g.strokeStyle = 'rgba(255, 107, 53, 0.6)';
    g.lineWidth = 1.4;
    g.setLineDash([3, 3]);
    g.beginPath();
    if (gx !== null && gy !== null) {
      g.moveTo(gx, gy);
      if (wx !== null && wy !== null) {
        g.lineTo(wx, wy);
        g.lineTo(sx, sy);
      } else {
        g.lineTo(sx, sy);
      }
    } else if (wx !== null && wy !== null) {
      g.moveTo(wx, wy);
      g.lineTo(sx, sy);
    }
    g.stroke();
    g.setLineDash([]);

    // Directional arrowhead pointing to current SPHEREx position
    const prevX = wx !== null ? wx : gx;
    const prevY = wy !== null ? wy : gy;
    if (prevX !== null && prevY !== null && Math.hypot(sx - prevX, sy - prevY) > 4) {
      const angle = Math.atan2(sy - prevY, sx - prevX);
      const arrowLen = 8;
      g.fillStyle = '#ff6b35';
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx - arrowLen * Math.cos(angle - Math.PI / 6), sy - arrowLen * Math.sin(angle - Math.PI / 6));
      g.lineTo(sx - arrowLen * Math.cos(angle + Math.PI / 6), sy - arrowLen * Math.sin(angle + Math.PI / 6));
      g.closePath();
      g.fill();
    }

    // Unified corner legend (bottom-left)
    g.fillStyle = 'rgba(10, 11, 16, 0.9)';
    g.fillRect(10, canvasHeight - 34, 205, 22);
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.lineWidth = 1;
    g.strokeRect(10, canvasHeight - 34, 205, 22);

    // Gaia (+)
    g.strokeStyle = '#5b9aff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(16, canvasHeight - 23); g.lineTo(24, canvasHeight - 23);
    g.moveTo(20, canvasHeight - 27); g.lineTo(20, canvasHeight - 19);
    g.stroke();
    g.fillStyle = '#5b9aff';
    g.font = '500 10px Inter, system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('Gaia (2016)', 28, canvasHeight - 23);

    // WISE (◇)
    g.strokeStyle = '#ff9a3c';
    g.beginPath();
    g.moveTo(96, canvasHeight - 23); g.lineTo(100, canvasHeight - 27);
    g.lineTo(104, canvasHeight - 23); g.lineTo(100, canvasHeight - 19);
    g.closePath();
    g.stroke();
    g.fillStyle = '#ff9a3c';
    g.fillText('WISE (2020)', 108, canvasHeight - 23);

    // SPHEREx (●)
    g.fillStyle = '#ff6b35';
    g.beginPath();
    g.arc(176, canvasHeight - 23, 3, 0, 2 * Math.PI);
    g.fill();
    g.fillText('2026', 182, canvasHeight - 23);
  }

  // D. Search Radius Circle from Cone Search
  if (showConeOverlays && coneRadiusArcmin > 0 && (coneResults.length > 0 || isConeSearchOpen)) {
    const pxRadius = (coneRadiusArcmin / fovArcmin) * canvasWidth;
    if (pxRadius > 15) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      g.lineWidth = 1.2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(canvasWidth / 2, canvasHeight / 2, pxRadius, 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);

      if (pxRadius > 35 && pxRadius < canvasWidth * 0.48) {
        g.fillStyle = 'rgba(255, 255, 255, 0.6)';
        g.font = '500 10px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Radio: ${coneRadiusArcmin}′`, canvasWidth / 2, Math.max(16, (canvasHeight / 2) - pxRadius - 6));
      }
    }
  }

  // E. Cone Search Numbered Result Markers on Visor
  if (showConeOverlays && coneResults.length > 0) {
    const cosDec = Math.cos((wcs.crval[1] * Math.PI) / 180.0);
    const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;
    const pxPerArcmin = canvasWidth / fovArcmin;

    coneResults.slice(0, 25).forEach((item) => {
      // Angular separation in arcminutes relative to center (East on left)
      const dRaArcmin = (wcs.crval[0] - item.ra) * safeCosDec * 60.0;
      const dDecArcmin = (item.dec - wcs.crval[1]) * 60.0;
      const mx = (canvasWidth / 2) + dRaArcmin * pxPerArcmin;
      const my = (canvasHeight / 2) - dDecArcmin * pxPerArcmin;

      if (Math.hypot(mx - (canvasWidth / 2), my - (canvasHeight / 2)) < 18) return;

      if (mx >= 14 && mx <= canvasWidth - 14 && my >= 14 && my <= canvasHeight - 14) {
        const isMover = item.isColdCandidate || item.pmArcsecPerYear >= 0.20;
        const color = isMover ? '#ff6b35' : item.kindCode.startsWith('V') ? '#eab308' : 'rgba(255, 255, 255, 0.65)';

        // Reticle ring
        g.strokeStyle = color;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(mx, my, 8, 0, 2 * Math.PI);
        g.stroke();

        // Background pill
        g.fillStyle = 'rgba(10, 11, 16, 0.85)';
        g.beginPath();
        g.arc(mx, my, 7, 0, 2 * Math.PI);
        g.fill();

        // Number
        g.fillStyle = color;
        g.font = '700 9px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(item.number), mx, my);

        // Name
        g.fillStyle = 'rgba(255, 255, 255, 0.75)';
        g.font = '500 9px Inter, system-ui, sans-serif';
        g.textAlign = mx > canvasWidth / 2 ? 'right' : 'left';
        g.textBaseline = 'middle';
        const labelX = mx > canvasWidth / 2 ? mx - 12 : mx + 12;
        const shortName = item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name;
        g.fillText(shortName, labelX, my);
      }
    });
  }

  // F. Catalog Markers Cross-Identification (Gaia DR3 & CatWISE2020)
  // Regla de diseño: símbolos mínimos (cruz y rombo) y una leyenda ÚNICA en la esquina, sin textos pegados a cada punto
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
        if (isGaia) {
          // Cruz mínima para Gaia DR3
          g.moveTo(cx - 5, cy); g.lineTo(cx + 5, cy);
          g.moveTo(cx, cy - 5); g.lineTo(cx, cy + 5);
        } else {
          // Rombo mínimo para CatWISE2020
          g.moveTo(cx, cy - 5);
          g.lineTo(cx + 5, cy);
          g.lineTo(cx, cy + 5);
          g.lineTo(cx - 5, cy);
          g.closePath();
        }
        g.stroke();
      }
    });

    // Leyenda ÚNICA en la esquina inferior izquierda (sin colisiones)
    g.fillStyle = 'rgba(12, 13, 18, 0.88)';
    g.fillRect(10, canvasHeight - 32, 175, 22);
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.lineWidth = 1;
    g.strokeRect(10, canvasHeight - 32, 175, 22);

    // Símbolo cruz Gaia
    g.strokeStyle = '#6aa7ff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(16, canvasHeight - 21); g.lineTo(24, canvasHeight - 21);
    g.moveTo(20, canvasHeight - 25); g.lineTo(20, canvasHeight - 17);
    g.stroke();

    g.fillStyle = '#6aa7ff';
    g.font = '500 10px Inter, system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('Gaia (2016)', 28, canvasHeight - 21);

    // Símbolo rombo CatWISE
    g.strokeStyle = '#ff9a3c';
    g.beginPath();
    g.moveTo(96, canvasHeight - 21); g.lineTo(100, canvasHeight - 25);
    g.lineTo(104, canvasHeight - 21); g.lineTo(100, canvasHeight - 17);
    g.closePath();
    g.stroke();

    g.fillStyle = '#ff9a3c';
    g.fillText('WISE (2020)', 108, canvasHeight - 21);
  }

  // G. Moving / Variable Target Tracking Indicator — SEÑALADO COMO UN ASTRÓNOMO (LÁPIZ GRASO)
  const f0 = frames.find((f) => f.epochIndex === 0)?.movingTargetPixel || { x: size / 2, y: size / 2 };
  const f3 = frames.find((f) => f.epochIndex === 3)?.movingTargetPixel || { x: size / 2, y: size / 2 };

  const interpT = epochFloat / 3.0;
  const interpX = (f0.x + (f3.x - f0.x) * interpT) * scale;
  const interpY = (f0.y + (f3.y - f0.y) * interpT) * scale;

  if (highlight && !curtainEnabled) {
    const cx = targetType === 'var' ? canvasWidth / 2 : interpX;
    const cy = targetType === 'var' ? canvasHeight / 2 : interpY;

    // Círculo irregular a mano alzada en color de alerta (cera roja de Clyde Tombaugh / Henrietta Leavitt)
    g.save();
    g.strokeStyle = '#ff6b35';
    g.lineWidth = 1.8;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const r = targetType === 'var' ? 24 : 18;
    const points: { x: number; y: number }[] = [];
    const startAngle = 3.14; // ~180°
    const totalAngle = 2 * Math.PI + 0.45; // ~405° vuelta con solape natural
    const steps = 18;

    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (i / steps) * totalAngle;
      const wobble = Math.sin(a * 3) * 1.7 + Math.cos(a * 5) * 1.1;
      const curR = r + wobble;
      points.push({
        x: cx + Math.cos(a) * curR,
        y: cy + Math.sin(a) * curR * 0.94,
      });
    }

    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const mx = (prev.x + curr.x) / 2;
      const my = (prev.y + curr.y) / 2;
      g.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    g.stroke();

    // Nota breve manuscrita al lado (serif en cursiva auténtica de cuaderno de campo)
    let noteText = '';
    if (targetName.includes('WISE 0855') || targetName.includes('0855')) {
      noteText = 'se mueve 8,1″/año';
    } else if (targetName.includes('Barnard')) {
      noteText = 'se mueve 10,36″/año';
    } else if (targetName.includes('Luhman')) {
      noteText = 'pareja binaria · 2,8″/año';
    } else if (targetName.includes('RW Aur')) {
      noteText = 'eclipses de polvo';
    } else if (targetName.includes('Mira')) {
      noteText = 'periodo 332 d';
    } else if (targetName.includes('TRAPPIST')) {
      noteText = 'se mueve 1,2″/año';
    } else if (targetType === 'var') {
      noteText = 'cambia de brillo';
    } else {
      noteText = 'se mueve';
    }

    g.font = 'italic 13px "Newsreader", "Playfair Display", Georgia, serif';
    g.fillStyle = '#ff6b35';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    // Colocar la anotación manuscrita justo arriba del objeto señalado (cuaderno de campo)
    const noteX = Math.max(12, Math.min(canvasWidth - 140, cx - 24));
    const noteY = Math.max(20, cy - r - 10);
    g.fillText(noteText, noteX, noteY);

    g.restore();

    // Si además es modo diferencia y objeto móvil, anotación técnica discreta
    if (mode === 'diff' && targetType !== 'var') {
      g.fillStyle = '#38bdf8';
      g.font = '500 10px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText('Par Dipolo (Cyan / Rojo)', interpX + 28, interpY + 18);
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
