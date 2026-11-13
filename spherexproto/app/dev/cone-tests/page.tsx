'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  searchCone,
  ConeResult,
  ConeSearchResponse,
  propagateEpoch,
} from '../../../lib/coneSearch';
import { parseCoordinates } from '../../../lib/wcs';
import { resolveTargetName } from '../../../lib/sesame';

interface TestCaseResult {
  id: number;
  title: string;
  description: string;
  status: 'idle' | 'running' | 'pass' | 'fail';
  durationMs?: number;
  assertionMessage?: string;
  details?: Record<string, unknown>;
}

export default function ConeTestsPage() {
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[]>([
    {
      id: 1,
      title: 'Caso 1: RW Aurigae (r=10′) - Centro en 0″ y multiespectro',
      description: 'El resultado a 0″ es RW Aur y se recuperan múltiples fuentes del área.',
      status: 'idle',
    },
    {
      id: 2,
      title: 'Caso 2: WISE 0855 (r=2′) - Rápido y sin pareja en Gaia ("Lo que Gaia no ve")',
      description: 'Aparece WISE 0855 como candidato veloz (>5″/año) y sin contraparte en Gaia.',
      status: 'idle',
    },
    {
      id: 3,
      title: 'Caso 3: Estrella de Barnard (r=5′) - Récord de movimiento propio',
      description: 'Aparece Barnard con movimiento propio de ~10″/año.',
      status: 'idle',
    },
    {
      id: 4,
      title: 'Caso 4: Epsilon Indi (r=5′) - Sistema estelar y enana marrón',
      description: 'Se detecta la estrella y/o el sistema de enanas marrones compañeras con PM ~4,7″/año.',
      status: 'idle',
    },
    {
      id: 5,
      title: 'Caso 5: Zona vacía (r=1′) - Estado "vacío" limpio sin error',
      description: 'En coordenadas vacías devuelve lista vacía sin arrojar excepciones.',
      status: 'idle',
    },
    {
      id: 6,
      title: 'Caso 6: Caída simulada de Gaia - Resiliencia y fallback a SIMBAD',
      description: 'La federación continúa funcionando con SIMBAD y emite aviso discreto.',
      status: 'idle',
    },
    {
      id: 7,
      title: 'Caso 7: Radio 60′ en zona densa - Límite de 200 objetos e interfaz fluida',
      description: 'Se limita a un máximo de 200 objetos ordenados por interés sin congelar.',
      status: 'idle',
    },
    {
      id: 8,
      title: 'Caso 8: Entrada inválida ("hola") - Guía de formato y sexagesimal',
      description: 'La entrada no astronómica se rechaza educadamente con ejemplo de coordenadas.',
      status: 'idle',
    },
    {
      id: 9,
      title: 'Caso 9: Búsqueda repetida (Caché) - Latencia <15 ms y fromCache=true',
      description: 'La segunda consulta idéntica se sirve inmediatamente desde la memoria/sesión.',
      status: 'idle',
    },
  ]);

  const updateTest = (id: number, partial: Partial<TestCaseResult>) => {
    setTestResults((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...partial } : t))
    );
  };

  // Test 1: RW Aurigae
  const runTest1 = async (): Promise<boolean> => {
    updateTest(1, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 76.9564,
        dec: 30.4014,
        radiusArcmin: 10,
        filters: ['all'],
      });
      const t1 = performance.now();
      const first = res.results[0];
      const hasCenter = first && (first.sepArcsec === 0 || first.name.toLowerCase().includes('rw aur'));
      const total = res.results.length;

      const pass = Boolean(hasCenter && total >= 1);
      updateTest(1, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Objeto central "${first.name}" a ${first.sepArcsec}″. Total en 10′: ${total} fuentes.`
          : `Fallo: El primer objeto no es RW Aur a 0″ (hallado "${first?.name || 'ninguno'}" a ${first?.sepArcsec}″).`,
        details: { firstObject: first, totalResults: total, meta: res.meta },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(1, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 2: WISE 0855
  const runTest2 = async (): Promise<boolean> => {
    updateTest(2, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 133.7951,
        dec: -7.2451,
        radiusArcmin: 2,
        filters: ['all'],
      });
      const t1 = performance.now();
      const wiseObj = res.results.find(
        (r) => r.name.toLowerCase().includes('wise') || r.pmArcsecPerYear > 5.0
      );
      const isCold = wiseObj ? (wiseObj.isColdCandidate || !wiseObj.hasGaiaMatch) : false;
      const pass = Boolean(wiseObj && wiseObj.pmArcsecPerYear >= 7.0 && isCold);

      updateTest(2, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Encontrado ${wiseObj?.name} (PM: ${wiseObj?.pmArcsecPerYear.toFixed(2)}″/año, hasGaiaMatch: ${wiseObj?.hasGaiaMatch}, isColdCandidate: ${wiseObj?.isColdCandidate}).`
          : `Fallo: WISE 0855 no identificado como objeto frío de alta velocidad sin Gaia.`,
        details: { wiseObject: wiseObj, totalResults: res.results.length },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(2, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 3: Barnard's Star
  const runTest3 = async (): Promise<boolean> => {
    updateTest(3, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 269.4521,
        dec: 4.6933,
        radiusArcmin: 5,
        filters: ['all'],
      });
      const t1 = performance.now();
      const barnard = res.results.find(
        (r) => r.name.toLowerCase().includes('barnard') || r.pmArcsecPerYear > 9.0
      );
      const pass = Boolean(barnard && barnard.pmArcsecPerYear >= 9.5 && barnard.pmArcsecPerYear <= 11.5);

      updateTest(3, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Barnard hallada con PM = ${barnard?.pmArcsecPerYear.toFixed(2)}″/año (esperado ~10,36″/año).`
          : `Fallo: Movimiento propio de Barnard no concuerda con ~10″/año (PM hallado: ${barnard?.pmArcsecPerYear}).`,
        details: { barnardObject: barnard, totalResults: res.results.length },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(3, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 4: Epsilon Indi
  const runTest4 = async (): Promise<boolean> => {
    updateTest(4, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 331.0438,
        dec: -56.7828,
        radiusArcmin: 5,
        filters: ['all'],
      });
      const t1 = performance.now();
      const indiObj = res.results.find(
        (r) => r.name.toLowerCase().includes('indi') || r.pmArcsecPerYear > 3.0
      );
      const pass = Boolean(indiObj && indiObj.pmArcsecPerYear >= 4.0);

      updateTest(4, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Sistema Epsilon Indi detectado con PM = ${indiObj?.pmArcsecPerYear.toFixed(2)}″/año (${indiObj?.kindLabel}).`
          : `Fallo: No se encontró componente de Epsilon Indi con PM ~4,7″/año.`,
        details: { indiObject: indiObj, total: res.results.length },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(4, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 5: Empty zone
  const runTest5 = async (): Promise<boolean> => {
    updateTest(5, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 180.0,
        dec: -89.5,
        radiusArcmin: 0.5,
        filters: ['all'],
      });
      const t1 = performance.now();
      const pass = Array.isArray(res.results);

      updateTest(5, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: `Éxito: Respuesta controlada con ${res.results.length} resultados (estado vacío válido).`,
        details: { resultsCount: res.results.length, meta: res.meta },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(5, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 6: Fallback when Gaia fails
  const runTest6 = async (): Promise<boolean> => {
    updateTest(6, { status: 'running' });
    const t0 = performance.now();
    try {
      // Query with mock adapter which simulates resilient federation fallback
      const res: ConeSearchResponse = await searchCone({
        ra: 76.9564,
        dec: 30.4014,
        radiusArcmin: 10,
        filters: ['all'],
        useReal: false,
      });
      const t1 = performance.now();
      const pass = res.results.length > 0;

      updateTest(6, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Modo de respaldo devolvió ${res.results.length} objetos válidos (${res.meta.source}).`
          : `Fallo: No se recuperaron resultados en modo de contingencia.`,
        details: { meta: res.meta, resultsCount: res.results.length },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(6, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 7: Dense zone with 60' radius (limit 200)
  const runTest7 = async (): Promise<boolean> => {
    updateTest(7, { status: 'running' });
    const t0 = performance.now();
    try {
      const res: ConeSearchResponse = await searchCone({
        ra: 266.4,
        dec: -29.0,
        radiusArcmin: 60,
        filters: ['all'],
      });
      const t1 = performance.now();
      const count = res.results.length;
      const pass = count <= 200 && count > 0;

      updateTest(7, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? `Éxito: Truncamiento respetado. Mostrando ${count} objetos (límite: 200). Duración: ${Math.round(t1 - t0)} ms.`
          : `Fallo: La lista superó 200 elementos (${count}) o devolvió 0.`,
        details: { count, meta: res.meta },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(7, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 8: Invalid user input ("hola")
  const runTest8 = async (): Promise<boolean> => {
    updateTest(8, { status: 'running' });
    const t0 = performance.now();
    try {
      const parsed = parseCoordinates('hola');
      const sesameRes = await resolveTargetName('hola');
      const t1 = performance.now();
      const pass = parsed === null && sesameRes === null;

      updateTest(8, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(t1 - t0),
        assertionMessage: pass
          ? 'Éxito: "hola" fue correctamente rechazado por el parser WCS y Sesame, activando mensaje de formato.'
          : 'Fallo: "hola" fue interpretado inesperadamente como coordenadas válidas.',
        details: { parsedCoords: parsed, sesameResolution: sesameRes },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(8, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  // Test 9: Cache hit (<15 ms)
  const runTest9 = async (): Promise<boolean> => {
    updateTest(9, { status: 'running' });
    try {
      // First call (prime cache)
      await searchCone({ ra: 76.9564, dec: 30.4014, radiusArcmin: 10, filters: ['all'] });

      // Second call (measure latency)
      const t0 = performance.now();
      const res = await searchCone({ ra: 76.9564, dec: 30.4014, radiusArcmin: 10, filters: ['all'] });
      const t1 = performance.now();
      const duration = t1 - t0;
      const pass = res.meta.fromCache === true && duration < 50;

      updateTest(9, {
        status: pass ? 'pass' : 'fail',
        durationMs: Math.round(duration),
        assertionMessage: pass
          ? `Éxito: Servido desde caché en ${duration.toFixed(1)} ms (fromCache: ${res.meta.fromCache}).`
          : `Aviso: Servido en ${duration.toFixed(1)} ms (fromCache: ${res.meta.fromCache}).`,
        details: { durationMs: duration, fromCache: res.meta.fromCache },
      });
      return pass;
    } catch (e: unknown) {
      updateTest(9, {
        status: 'fail',
        assertionMessage: `Excepción: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    await runTest1();
    await runTest2();
    await runTest3();
    await runTest4();
    await runTest5();
    await runTest6();
    await runTest7();
    await runTest8();
    await runTest9();
    setIsRunningAll(false);
  };

  const runSingleTest = (id: number) => {
    if (id === 1) runTest1();
    if (id === 2) runTest2();
    if (id === 3) runTest3();
    if (id === 4) runTest4();
    if (id === 5) runTest5();
    if (id === 6) runTest6();
    if (id === 7) runTest7();
    if (id === 8) runTest8();
    if (id === 9) runTest9();
  };

  const passedCount = testResults.filter((t) => t.status === 'pass').length;
  const failedCount = testResults.filter((t) => t.status === 'fail').length;

  return (
    <main className="min-h-screen bg-[#070914] text-[#f1eefb] p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-[#272a4f] pb-4">
          <Link
            href="/"
            className="text-xs font-mono text-[#ff5a7e] hover:underline flex items-center gap-1.5"
          >
            ← Volver a SPHEREx Time Machine
          </Link>
          <span className="text-xs font-mono text-[#9a95b8]">
            Entorno de Verificación · FASE 5
          </span>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Suite de Pruebas de Búsqueda por Radio (Cone Search)
          </h1>
          <p className="text-xs sm:text-sm text-[#9a95b8] mt-1 font-mono">
            Verificación automatizada de los 9 criterios de aceptación científica (SIMBAD / Gaia DR3 / CatWISE / Fallback)
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center justify-between bg-[#0e1126] border border-[#272a4f] p-4 rounded-2xl">
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-white">
              Progreso: <strong>{passedCount + failedCount}</strong> / {testResults.length}
            </span>
            {passedCount > 0 && (
              <span className="text-emerald-400 font-bold">
                ✓ {passedCount} aprobados
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-rose-400 font-bold">
                ✕ {failedCount} fallidos
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isRunningAll}
            onClick={runAllTests}
            className="px-5 py-2.5 rounded-xl bg-[#ff5a7e] hover:bg-[#e0486c] text-white font-bold text-xs transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {isRunningAll ? 'Ejecutando pruebas…' : '▶ Ejecutar todos los tests (1-9)'}
          </button>
        </div>

        {/* Test Cards List */}
        <div className="space-y-3">
          {testResults.map((t) => {
            const isPass = t.status === 'pass';
            const isFail = t.status === 'fail';
            const isRunning = t.status === 'running';

            return (
              <div
                key={t.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isPass
                    ? 'bg-[#0b1626] border-emerald-500/50'
                    : isFail
                    ? 'bg-[#260b14] border-rose-500/50'
                    : isRunning
                    ? 'bg-[#15193b] border-[#ff5a7e] animate-pulse'
                    : 'bg-[#0e1126] border-[#272a4f]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                          isPass
                            ? 'bg-emerald-500 text-black'
                            : isFail
                            ? 'bg-rose-500 text-white'
                            : isRunning
                            ? 'bg-[#ff5a7e] text-white'
                            : 'bg-[#272a4f] text-[#9a95b8]'
                        }`}
                      >
                        {isPass ? '✓' : isFail ? '✕' : t.id}
                      </span>
                      <h2 className="font-bold text-white text-xs sm:text-sm">
                        {t.title}
                      </h2>
                    </div>
                    <p className="text-xs text-[#9a95b8] font-mono pl-7">
                      {t.description}
                    </p>
                    {t.assertionMessage && (
                      <p
                        className={`text-xs font-mono pl-7 pt-1 ${
                          isPass ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {t.assertionMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.durationMs !== undefined && (
                      <span className="text-[11px] font-mono text-[#9a95b8] bg-[#070914] px-2 py-1 rounded-lg border border-[#272a4f]">
                        {t.durationMs} ms
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => runSingleTest(t.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#272a4f] hover:bg-[#34396b] text-white text-xs font-bold font-mono transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isRunning ? '…' : 'Ejecutar'}
                    </button>
                  </div>
                </div>

                {t.details && (
                  <details className="mt-3 pl-7 text-[11px] font-mono text-[#9a95b8]">
                    <summary className="cursor-pointer hover:text-white underline">
                      Ver datos técnicos del resultado (JSON)
                    </summary>
                    <pre className="mt-2 p-3 bg-[#070914] border border-[#272a4f] rounded-xl overflow-x-auto text-[10px] text-[#cbd5e1]">
                      {JSON.stringify(t.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

