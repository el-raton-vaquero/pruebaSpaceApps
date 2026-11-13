import { Frame, WCS } from './types';
import { createAnimatedGif } from './gifEncoder';
import { getColormapLut, applyStretch } from './colormaps';

export interface GifExportOptions {
  frames: Frame[];
  wcs: WCS;
  targetName: string;
  colormap: 'inferno' | 'viridis' | 'greyscale';
  stretch: 'asinh' | 'log' | 'linear';
  contrast: number;
  activeDetectors: boolean[];
  onProgress?: (step: string) => void;
}

export async function exportTimelapseGif(opts: GifExportOptions): Promise<void> {
  const { frames, targetName, colormap, stretch, contrast, activeDetectors, onProgress } = opts;

  if (!frames || frames.length === 0) return;

  onProgress?.('Generando fotogramas de época…');

  const size = frames[0].width;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const lut = getColormapLut(colormap);
  const ctMultiplier = contrast / 65.0;
  const minVal = 2.0;
  const maxVal = Math.max(25.0, 180.0 / ctMultiplier);

  const activeDets = activeDetectors
    .map((on, idx) => (on ? idx + 1 : null))
    .filter((d): d is number => d !== null);

  const dates = ['Jun 2025', 'Dic 2025', 'Jun 2026', 'Dic 2026'];
  const gifFrames: { imageData: ImageData; delayMs: number }[] = [];

  for (let ep = 0; ep < 4; ep++) {
    onProgress?.(`Procesando Época ${ep + 1} de 4…`);

    const epFrames = frames.filter((f) => f.epochIndex === ep && activeDets.includes(f.detector));
    const normal = new Float32Array(size * size);

    if (epFrames.length > 0) {
      epFrames.forEach((f) => {
        for (let i = 0; i < normal.length; i++) normal[i] += f.pixelData[i];
      });
      for (let i = 0; i < normal.length; i++) normal[i] /= epFrames.length;
    }

    const imgData = ctx.createImageData(size, size);
    const data32 = new Uint32Array(imgData.data.buffer);

    for (let i = 0; i < normal.length; i++) {
      const v = normal[i];
      const stretched = applyStretch(v, minVal, maxVal, stretch);
      const lutIdx = Math.floor(Math.max(0, Math.min(1, stretched)) * 255);
      const c = lut[lutIdx] || lut[0];
      data32[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw subtle watermark on the frame
    ctx.fillStyle = 'rgba(7, 9, 15, 0.8)';
    ctx.fillRect(8, 8, 140, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(`SPHEREx · ${dates[ep]}`, 14, 22);

    const captured = ctx.getImageData(0, 0, size, size);
    gifFrames.push({
      imageData: captured,
      delayMs: 450, // 450ms per epoch for optimal visual blink
    });
  }

  onProgress?.('Codificando animación GIF89a…');
  await new Promise((r) => setTimeout(r, 60));

  const blob = createAnimatedGif(gifFrames);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SPHEREx_${targetName.replace(/\s+/g, '_')}_timelapse.gif`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface DiscoveryCardOptions {
  canvasElement: HTMLCanvasElement;
  targetName: string;
  category: string;
  raStr: string;
  decStr: string;
  distanceLy: string;
  pmSpeed: string;
}

export function exportDiscoveryCard(opts: DiscoveryCardOptions): void {
  const { canvasElement, targetName, category, raStr, decStr, distanceLy, pmSpeed } = opts;

  const w = 620;
  const h = 760;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, w, h);

  // Outer border
  ctx.strokeStyle = '#1e2240';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Top Spectral Ribbon
  const ribbonCols = ['#6aa7ff', '#4fd1a5', '#ffd34f', '#ff9a3c', '#d44f6e', '#b07cff'];
  const segW = (w - 20) / 6;
  ribbonCols.forEach((col, idx) => {
    ctx.fillStyle = col;
    ctx.fillRect(10 + idx * segW, 10, segW, 5);
  });

  // Header Title
  ctx.fillStyle = '#7b78a0';
  ctx.font = '600 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TELESCOPIO ESPACIAL SPHEREx · NASA SPACE APPS CHALLENGE', 26, 38);

  ctx.fillStyle = '#edeaf8';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('Ficha de Detección en el Infrarrojo', 26, 68);

  // Canvas Image Cutout Box
  const imgBoxW = 568;
  const imgBoxH = 420;
  ctx.fillStyle = '#0a0d1f';
  ctx.fillRect(26, 84, imgBoxW, imgBoxH);
  ctx.strokeStyle = '#272a4f';
  ctx.strokeRect(26, 84, imgBoxW, imgBoxH);

  // Draw current sky cutout
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvasElement, 26, 84, imgBoxW, imgBoxH);

  // Metadata Panel
  const metaY = 524;
  ctx.fillStyle = '#0f1221';
  ctx.fillRect(26, metaY, imgBoxW, 155);
  ctx.strokeStyle = '#1e2240';
  ctx.strokeRect(26, metaY, imgBoxW, 155);

  ctx.fillStyle = '#edeaf8';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(targetName, 42, metaY + 30);

  ctx.fillStyle = '#d44f6e';
  ctx.font = '600 12px sans-serif';
  ctx.fillText(category, 42, metaY + 50);

  // Data grid
  const data = [
    ['Coordenadas J2000', `${raStr}, ${decStr}`],
    ['Movimiento Propio', pmSpeed || 'En catálogo'],
    ['Distancia Solar', distanceLy || 'En catálogo'],
    ['Espectro', '0,75 – 5,00 µm (102 canales)'],
    ['Calibración', 'WCS TAN / Matriz Float32Array'],
    ['Observatorio', 'NASA SPHEREx (Épocas 1 a 4)'],
  ];

  ctx.font = '11px monospace';
  data.forEach(([lbl, val], idx) => {
    const colX = idx < 3 ? 42 : 310;
    const rowY = metaY + 80 + (idx % 3) * 22;
    ctx.fillStyle = '#7b78a0';
    ctx.fillText(`${lbl}:`, colX, rowY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(val, colX + 130, rowY);
  });

  // Footer
  ctx.fillStyle = '#7b78a0';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Generado con SPHEREx Time Machine · https://spherex.space', w / 2, h - 22);

  const dataUrl = off.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `SPHEREx_Hallazgo_${targetName.replace(/\s+/g, '_')}.png`;
  a.click();
}
