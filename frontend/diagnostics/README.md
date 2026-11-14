# Diagnóstico histórico de catálogos

`ConeTests.tsx.txt` preserva el código de la antigua ruta
`spherexproto/app/dev/cone-tests/page.tsx`, con imports ajustados al frontend.
No se compila ni se expone como ruta pública. Sus expectativas de catálogos,
movimiento y disponibilidad necesitan revisión antes de ejecutarlo manualmente;
no se afirma que esos nueve casos hayan pasado.

Las pruebas mantenidas del producto son `scripts/test-integration.cjs`, la suite
Python de `server/tests` y el E2E de `server/scripts/test_frontend_integration.py`.
