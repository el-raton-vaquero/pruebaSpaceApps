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
  console.log('Uso: npm run ingest -- --ra <deg> --dec <deg> [--fov <arcmin>] [--name <nombre>]');
  console.log('Ejemplo: npm run ingest -- --ra 133.795 --dec -7.245 --fov 5 --name "WISE 0855"');
  process.exit(0);
}

const manifestPath = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
let manifest = { targets: [] };

if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error('Error al leer manifest:', e);
  }
}

const id = `target_${Math.round(ra * 100)}_${Math.round(dec * 100)}`;
const newTarget = {
  id,
  name,
  category: 'Candidato Infrarrojo',
  ra,
  dec,
  distanceLy: 'En catálogo',
  pmRaMasYr: 0,
  pmDecMasYr: 0,
  source: 'SPHEREx Pipeline / IRSA Cutouts',
  ingestedAt: new Date().toISOString()
};

const existingIdx = manifest.targets.findIndex(t => Math.hypot(t.ra - ra, t.dec - dec) < 0.005);
if (existingIdx >= 0) {
  manifest.targets[existingIdx] = { ...manifest.targets[existingIdx], ...newTarget };
  console.log(`[SPHEREx Ingest] Actualizado objeto existente: ${name}`);
} else {
  manifest.targets.push(newTarget);
  console.log(`[SPHEREx Ingest] Añadido nuevo objeto: ${name} (RA: ${ra}, Dec: ${dec})`);
}

manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`[SPHEREx Ingest] Manifiesto actualizado exitosamente en ${manifestPath}`);

