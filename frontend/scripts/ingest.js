/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS CLI */
const fs = require('fs');
const path = require('path');

// CLI Argument parser
const args = process.argv.slice(2);
let ra = null;
let dec = null;
let fov = 5.0;
let name = 'Nuevo Objeto';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ra' && args[i + 1]) ra = parseFloat(args[++i]);
  else if (args[i] === '--dec' && args[i + 1]) dec = parseFloat(args[++i]);
  else if (args[i] === '--fov' && args[i + 1]) fov = parseFloat(args[++i]);
  else if (args[i] === '--name' && args[i + 1]) name = args[++i];
}

if (ra === null || dec === null) {
  console.log('Solo registra un ejemplo educativo; no descarga datos. Uso: npm run ingest -- --ra <deg> --dec <deg> [--fov <arcmin>] [--name <nombre>]');
  console.log('Ejemplo: npm run ingest -- --ra 133.795 --dec -7.245 --fov 5 --name "WISE 0855"');
  process.exit(0);
}

if (!Number.isFinite(ra) || ra < 0 || ra >= 360 || !Number.isFinite(dec) || dec < -90 || dec > 90 || !Number.isFinite(fov) || fov <= 0) { console.error('Coordenadas o campo inválidos'); process.exit(1); }

const manifestPath = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
let manifest = { targets: [] };

if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error('Error al leer manifest:', e);
    process.exit(1);
  }
}

const id = `target_${Math.round(ra * 100)}_${Math.round(dec * 100)}`;
const newTarget = {
  id,
  name,
  category: 'Ejemplo educativo',
  ra,
  dec,
  distanceLy: null,
  pmRaMasYr: 0,
  pmDecMasYr: 0,
  source: 'Metadatos de demostración; sin descarga de observaciones',
  data_origin: 'synthetic_demo',
  fovArcmin: fov,
  ingestedAt: new Date().toISOString()
};

const existingIdx = manifest.targets.findIndex(t => Math.hypot(t.ra - ra, t.dec - dec) < 0.005);
if (existingIdx >= 0) {
  manifest.targets[existingIdx] = { ...manifest.targets[existingIdx], ...newTarget };
  console.log(`[Demo metadata] Actualizado objeto existente: ${name}`);
} else {
  manifest.targets.push(newTarget);
  console.log(`[Demo metadata] Añadido nuevo objeto: ${name} (RA: ${ra}, Dec: ${dec})`);
}

manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`[Demo metadata] Manifiesto actualizado exitosamente en ${manifestPath}`);

