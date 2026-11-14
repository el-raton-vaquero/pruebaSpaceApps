# Resolución del merge — 2026-11-14

Merge en curso en `Main`:

- HEAD: `1c8b3486d8893c7438ffaa3545b4f60a018735c3`.
- Entrante (`fork/main`): `201c2f5401239b0634eea99627819ac2d7809bcd`.

Se resolvieron 13 rutas en conflicto sin abortar ni reiniciar el merge. El
resultado conserva una sola aplicación en `frontend/` y el servicio en `server/`.
No se crea el commit de merge ni se hace push.

## Decisiones

- Layout: fuentes originales DM Serif Display/Inter, variante cursiva y ambas
  preconexiones; título y descripción de comparación científica de la versión
  entrante. La preferencia de color original se conserva.
- Carta cónica: dibujo e interacción original más selección por teclado entrante.
- Espectro: representación y CSV originales, leyendo el estado compartido; no se
  reintroduce extracción independiente en el píxel fijo 128,128.
- Motor/exportaciones: procesamiento de dimensiones variables y máscaras,
  diferencia/mediana, escala adaptada y exportaciones identificadas por origen.
  La interfaz original, Cortina y herramientas educativas ya están conectadas
  en los archivos migrados de la rama entrante.
- Traducciones: diccionario original y textos nuevos de integración, conservando
  la identificación de simulación y evitando afirmaciones de datos adquiridos.
- Hook: fachada del store; no se duplica caché ni carga de observaciones.
- Tailwind: regenerado después de resolver los componentes, no mezclado a mano.
- Las cinco rutas `spherexproto/` con conflictos modificar/eliminar se eliminaron
  únicamente tras verificar su implementación migrada a `frontend/`.

El manifest y el comando `ingest` no se perdieron: ahora están bajo
`frontend/public/data/` y `frontend/scripts/`. El CLI registra **metadatos de
un ejemplo educativo**, no descarga ni valida observaciones. Se corrigió su
origen, se agregó el FOV solicitado y se rechazan coordenadas inválidas sin
sobrescribir el manifest. Este registro no alimenta automáticamente el API real.

El diagnóstico cónico antiguo se conserva como fuente histórica en
`frontend/diagnostics/ConeTests.tsx.txt`, fuera de rutas y compilación. Sus casos
requieren servicios externos y revisión manual; no constituyen pruebas pasadas
ni validación científica del producto. No se mantienen dos aplicaciones Next.js.
Los directorios locales ignorados, como node_modules, no se borraron.

## Verificación realizada en este clon

- `cd frontend && npm ci`: correcto (364 paquetes).
- `cd server && uv sync --locked`: correcto.
- `cd frontend && npm run lint`: sin errores; una advertencia existente sobre
  fuente personalizada.
- `cd frontend && npx tsc --noEmit`: correcto.
- `cd frontend && node scripts/test-integration.cjs`: correcto; dimensiones,
  máscaras, diferencia, mediana, cortina, caché, cancelación y respuestas tardías.
- `cd frontend && npm run build`: producción y tipos correctos. El primer build
  compiló pero no pudo leer la salida del subproceso TypeScript en el sandbox;
  el build fuera de ese entorno pasó.
- `cd frontend && npm run ingest` sin parámetros: ayuda correcta, sin escritura.
  Prueba aislada en /tmp del CLI: genera origen sintético explícito y rechaza
  coordenadas inválidas manteniendo intacto el manifest.
- Backend sin caché local: 44 pruebas correctas y tres fallos por respuestas 503
  esperadas ante ausencia de los FITS. No se alteraron los tests para ocultarlo.
- Backend con `SPHEREX_DATA_DIR` apuntando en modo lectura a la caché auténtica
  existente: **47 pruebas correctas**, una advertencia Starlette/httpx.
- Chromium contra el build de este clon en :3100: real y simulación, fechas,
  Blink/pausa, Diferencia, máscaras, Cortina por teclado, espectro educativo,
  carta simulada, PNG/GIF, ayuda/Escape, idioma, error de región, embed y portada.
  Se verificaron dimensiones de escritorio/móvil y ausencia de errores de runtime
  en los recorridos normales. No se verificaron catálogos externos en vivo.

Capturas: `docs/assets/merge-resolution-{real,mock}-{desktop,mobile}.png`.
La prueba E2E admite ahora `SPHEREX_FRONTEND_URL` y `SPHEREX_SCREENSHOT_PREFIX`;
la captura comparativa de otro frontend es opcional con `SPHEREX_REFERENCE_URL`.
Ya no exige ejecutar una segunda aplicación que fue retirada por la migración.

## Reproducir los checks con la caché utilizada

En este equipo, desde `server/`:

```sh
export SPHEREX_DATA_DIR=/home/jorge/spaceApps/SphereX_SpaceApps/server/outputs/m101
uv run --locked pytest -q
uv run --locked uvicorn spherex.api:app --host 127.0.0.1 --port 8000
```

En otra terminal, desde `frontend/`:

```sh
npm run build
npm run start -- --port 3100
```

Desde `server/`, con ambos servicios activos:

```sh
SPHEREX_FRONTEND_URL=http://localhost:3100 SPHEREX_SCREENSHOT_PREFIX=merge-resolution uv run --locked python scripts/test_frontend_integration.py
```

La ruta de caché es externa a este clon y no se incorpora a Git. En otro equipo,
preparar los datos siguiendo `server/README.md`; sin ellos se muestra un error
real, nunca una sustitución sintética. Se conservan los límites científicos y
la traducción parcial de herramientas avanzadas documentados anteriormente.

El chequeo del índice completo señala espacios finales heredados de la rama
entrante en `docs/official-resources-review.md`, `ControlPanel.tsx` y `fits.py`.
No son marcadores de conflicto; se conservaron sin reformatear archivos ajenos
a la resolución. El índice no tiene entradas sin fusionar.
