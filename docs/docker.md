# Docker Compose — SPHEREx Time Machine

## Arranque

Desde la raíz del repositorio, con Docker Engine y Compose disponibles:

```sh
docker compose up -d
```

No se necesita instalar Python, Node ni uv en el host, ni crear un `.env`.
Compose construye las imágenes si no existen. Abre http://localhost:3000;
`?api=real` muestra M101 y `?api=mock` selecciona la simulación explícitamente.

El primer arranque descarga dependencias y prepara los datos auténticos desde
NASA/IPAC IRSA. Puede tardar varios minutos y depende de la disponibilidad de IRSA.
El comando espera las dependencias de arranque aunque se use `-d`.
No se descargan datos científicos durante la construcción de imágenes.

```sh
docker compose ps -a
docker compose logs -f data-init
docker compose logs --tail=100 backend frontend
```

`data-init` en `Exited (0)` es correcto: es una tarea de inicialización, no un
servidor. Backend/frontend deben quedar `healthy`.

## Servicios y almacenamiento

- `data-init`: misma imagen Python que backend, ejecuta el preparador existente
  con salida `/data/m101`; verifica y reutiliza una caché válida.
- `backend`: FastAPI :8000 solo en la red Compose. Lee `/data` en solo lectura.
  Su healthcheck exige servicio activo y `m101_cached: true`.
- `frontend`: Next.js standalone :3000, único puerto publicado. El navegador
  consulta `/api/*`; Next.js lo reenvía a `http://backend:8000`.

El volumen nombrado `spherex-data` guarda FITS, manifiestos, respuestas del archivo
y productos de comparación. El nombre efectivo lleva el prefijo del proyecto
Compose, por ejemplo `pruebaspaceapps_spherex-data`. Los procesos ejecutan como
usuario `app` (UID/GID 10001); la imagen inicializa la ruta con ese propietario.
No se montan directorios personales ni se incluyen FITS o credenciales en imágenes.

El orden de inicio es preparación correcta → backend saludable → frontend.
Si IRSA falla, la comparación no pasa las validaciones o el volumen no es
escribible, data-init termina con error y los servidores dependientes no arrancan.
Nunca se reemplazan observaciones por simulación para ocultar el fallo.
Los límites de descargas y calidad permanecen en el pipeline existente.

## Configuración y actualización

Puerto opcional:

```sh
FRONTEND_PORT=8080 docker compose up -d
```

También se puede copiar `.env.example` a `.env` y ajustar `FRONTEND_PORT`.
El archivo local `.env` no se versiona. Cambiar el puerto no exige reconstruir.

Después de modificar código:

```sh
docker compose up -d --build
```

El build usa `npm ci`, el CSS del proyecto y Next.js 16 standalone; Python 3.14
usa `uv sync --locked --no-dev` con uv 0.13.5. Las imágenes base son Node 24 y
Python 3.14 sobre Debian slim. No hay recarga de desarrollo en esta configuración.

`SPHEREX_API_INTERNAL_URL` configura el destino del proxy **durante el build** de
Next.js: Compose fija `http://backend:8000`; sin esa variable, el desarrollo local
conserva `http://127.0.0.1:8000`. Cambiarla requiere reconstruir el frontend; no
sirve modificarla solo al ejecutar el contenedor. El cliente mantiene URLs relativas,
el contrato HTTP, WCS, máscaras y separación real/simulación sin cambios.

## Reinicio y recuperación

```sh
docker compose restart backend frontend
docker compose down
docker compose up -d
```

`down` conserva el volumen. No usar `down -v` salvo que se quiera **eliminar los
datos descargados** y repetir la preparación completa. No hacen falta comandos
`prune` ni permisos especiales sobre directorios del host.

Si falla la primera preparación, inspeccionar los logs, corregir red/espacio y
repetir `docker compose up -d`. Una caché válida evita nuevas descargas.
Para reconstruir deliberadamente productos inválidos, detener lectores primero:

```sh
docker compose stop frontend backend
docker compose run --rm data-init python -m spherex.prepare --output /data/m101 --force
docker compose up -d
```

No modificar la caché mientras backend está sirviéndola. El preparador preserva
su historial y valida el resultado. No se ejecuta `--force` durante arranque normal.

## Respaldo

Crear una carpeta local y exportar el volumen sin modificarlo:

```sh
mkdir -p backups
docker compose run --rm --no-deps -T backend tar -C /data -czf - . > backups/spherex-data.tar.gz
```

Guardar el respaldo fuera de Git. Para restaurar un respaldo en este mismo proyecto,
detener backend/frontend y ejecutar con el volumen escribible de data-init:

```sh
docker compose stop frontend backend
docker compose run --rm --no-deps -T data-init tar -C /data -xzf - < backups/spherex-data.tar.gz
docker compose up -d
```

Restaurar solo respaldos de confianza y compatibles; el preparador comprobará su
usabilidad. Esto permite usar datos auténticos previamente adquiridos sin
introducir un dataset sintético en la ruta real.

## Verificación

```sh
docker compose config --quiet
python3 scripts/check_compose.py http://localhost:3000
curl http://localhost:3000/api/health
curl 'http://localhost:3000/api/frames?ra=210.80227&dec=54.34895&fov=3'
```

El script de comprobación solo inspecciona el despliegue en marcha: valida el
proxy, estado de caché, dos frames reales, Detector 2, dimensiones y máscaras,
y el error de una región no soportada. No descarga datos ni borra volúmenes.

Para E2E con Chromium instalado en el host, consultar el script existente:

```sh
cd server
SPHEREX_FRONTEND_URL=http://localhost:3000 SPHEREX_SCREENSHOT_PREFIX=docker uv run --locked python scripts/test_frontend_integration.py
```

Las pruebas de contenedor deben ejecutarse además de las comprobaciones locales;
la preparación real requiere internet en el primer uso. No se garantiza detección
de movimiento, espectros calibrados ni disponibilidad de todos los catálogos.

## Resultados verificados — 2026-11-14

Verificación real con Docker Engine 29.9.3 / Compose v5.7.1, Linux amd64:

- `docker compose config --quiet` y variante `FRONTEND_PORT=8080`: correctos.
- `docker compose build`: tres servicios construidos correctamente con Node
  24/Python 3.14, locks existentes, Next.js standalone y usuario app.
- Primer `docker compose up -d` con volumen vacío: descarga real y pipeline
  completados con `visualization_pair_validated`; data-init terminó en 0 y
  backend/frontend quedaron saludables. No se importó la caché del host.
- El proxy entregó las observaciones `2026W20_2A_0464_3` y `2026W26_1A_0500_1`,
  Detector 2, 30×30 y máscaras; región no soportada devolvió 404.
- `python3 scripts/check_compose.py`: correcto antes y después de reinicios.
- `python3 scripts/check_docker_failure_modes.py`: preparación offline con caché
  vacía termina en 2; FITS inválido se rechaza; API sin datos devuelve
  `m101_cached=false` y HTTP 503. Son contenedores desechables con datos de prueba
  únicamente en /tmp, sin alterar el volumen científico principal.
- Ambos servicios HTTP ejecutan como UID 10001. El backend rechazó una escritura
  de prueba en /data con EROFS. La imagen backend sin volumen no tiene productos
  en /data/m101; no contiene .env/.git. La imagen frontend no incluye TypeScript.
- `docker compose restart backend frontend` y `docker compose down` seguido de
  `docker compose up -d --wait`: correctos. Los hashes de manifest.json y
  aligned.fits permanecieron idénticos; el log de data-init confirmó reutilización
  sin descargas. No se ejecutó `down -v`.
- Chromium E2E contra http://localhost:3000 servido por Compose: real/simulación,
  Blink, Diferencia, Cortina por teclado, máscaras, espectro educativo, carta
  simulada, exportación, ayuda/Escape, idioma, error, embed y portada correctos.
  Capturas: `docs/assets/docker-{real,mock}-{desktop,mobile}.png`.
- Fuera de contenedores: lint sin errores (una advertencia de fuente existente),
  TypeScript y pruebas frontend correctos; 47 pruebas científicas pasan usando
  la caché auténtica externa para esas pruebas (una advertencia Starlette/httpx).

El daemon inicialmente no estaba disponible; tras activarlo el usuario se
realizaron las construcciones y pruebas de contenedor indicadas arriba. El
respaldo/restauración está documentado, pero no se ejecutó en esta verificación.
La plataforma ARM64 no se probó. El acceso a catálogos externos y fuentes web
sigue dependiendo de la conectividad del navegador.
