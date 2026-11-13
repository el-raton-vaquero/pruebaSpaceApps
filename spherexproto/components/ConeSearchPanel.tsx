'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ConeResult,
  ConeFilterType,
  CURATED_CONE_TARGETS,
  searchCone,
  formatSeparation,
  formatMovementSpeed,
} from '../lib/coneSearch';
import { resolveTargetName } from '../lib/sesame';
import { parseCoordinates, formatSexagesimal } from '../lib/wcs';
import { sound } from '../lib/sound';
import { CelestialConeChart } from './CelestialConeChart';

interface ConeSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentRa: number;
  currentDec: number;
  currentName: string;
  onSelectResult: (result: ConeResult) => void;
  onResultsChange: (results: ConeResult[], radiusArcmin: number) => void;
  onHuntArea?: () => void;
  initialRadius?: number;
  initialFilters?: ConeFilterType[];
}

export function ConeSearchPanel({
  isOpen,
  onClose,
  currentRa,
  currentDec,
  currentName,
  onSelectResult,
  onResultsChange,
  onHuntArea,
  initialRadius = 10,
  initialFilters = ['all'],
}: ConeSearchPanelProps) {
  // Center coordinates & query string
  const [centerInput, setCenterInput] = useState<string>('');
  const [activeCoords, setActiveCoords] = useState<{ ra: number; dec: number }>({
    ra: currentRa,
    dec: currentDec,
  });

  // Search parameters
  const [radiusArcmin, setRadiusArcmin] = useState<number>(initialRadius);
  const [filters, setFilters] = useState<ConeFilterType[]>(initialFilters);
  const [sortBy, setSortBy] = useState<'interest' | 'distance'>('interest');

  // UI state
  const [showChart, setShowChart] = useState<boolean>(true);
  const [curatedIndex, setCuratedIndex] = useState<number>(0);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [hoveredResultId, setHoveredResultId] = useState<string | null>(null);

  // Status & Data
  const [rawResults, setRawResults] = useState<ConeResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Iniciando consulta...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onResultsChangeRef = useRef(onResultsChange);

  useEffect(() => {
    onResultsChangeRef.current = onResultsChange;
  }, [onResultsChange]);

  // Sync initial values when current object changes or panel opens
  useEffect(() => {
    if (isOpen) {
      setActiveCoords((prev) => {
        if (prev.ra === currentRa && prev.dec === currentDec) return prev;
        return { ra: currentRa, dec: currentDec };
      });
      setCenterInput((prev) => (prev === currentName ? prev : currentName));
    }
  }, [isOpen, currentRa, currentDec, currentName]);

  // Execute Search: Fetch all candidates in the cone to calculate dynamic category counts
  const executeSearch = useCallback(
    async (raToUse: number, decToUse: number, radToUse: number) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setLoadingStep('Consultando SIMBAD TAP, Gaia DR3 y WISE...');
      setErrorMessage('');

      try {
        const response = await searchCone({
          ra: raToUse,
          dec: decToUse,
          radiusArcmin: radToUse,
          filters: ['all'],
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setRawResults(response.results);
          setNoticeMessage(response.notice || '');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setErrorMessage(
          'No se pudo conectar con el catálogo astronómico federado (SIMBAD / Gaia / WISE). Comprueba tu conexión o reintenta.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  // Trigger search with debounce whenever activeCoords or radius changes
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin);
    }, 280);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, activeCoords, radiusArcmin, executeSearch]);

  // Compute dynamic category counts BEFORE filtering
  const counts = useMemo(() => {
    return {
      all: rawResults.length,
      fast: rawResults.filter((r) => r.pmArcsecPerYear >= 0.20).length,
      coldcandidate: rawResults.filter(
        (r) =>
          r.isColdCandidate ||
          (!r.hasGaiaMatch && (r.kindCode.startsWith('BD') || r.pmArcsecPerYear >= 0.1))
      ).length,
      browndwarf: rawResults.filter(
        (r) => r.kindCode.startsWith('BD') || r.kindLabel.toLowerCase().includes('marrón')
      ).length,
      variable: rawResults.filter(
        (r) =>
          r.kindCode.startsWith('V') ||
          r.kindCode.startsWith('Mi') ||
          r.kindLabel.toLowerCase().includes('cambia')
      ).length,
    };
  }, [rawResults]);

  // Filtered and Ranked results by Scientific Interest Score or Distance
  const displayedResults = useMemo(() => {
    let list = rawResults;
    if (!filters.includes('all') && filters.length > 0) {
      list = rawResults.filter((item) => {
        return filters.some((f) => {
          if (f === 'fast') return item.pmArcsecPerYear >= 0.20;
          if (f === 'coldcandidate')
            return (
              item.isColdCandidate ||
              (!item.hasGaiaMatch && (item.kindCode.startsWith('BD') || item.pmArcsecPerYear >= 0.1))
            );
          if (f === 'browndwarf')
            return item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
          if (f === 'variable')
            return (
              item.kindCode.startsWith('V') ||
              item.kindCode.startsWith('Mi') ||
              item.kindLabel.toLowerCase().includes('cambia')
            );
          return true;
        });
      });
    }

    // Sort order:
    // Center object (0″) always first
    // Then sort according to user selection ('interest' or 'distance')
    const sorted = [...list].sort((a, b) => {
      if (a.sepArcsec === 0 && b.sepArcsec !== 0) return -1;
      if (b.sepArcsec === 0 && a.sepArcsec !== 0) return 1;

      if (sortBy === 'distance') {
        if (a.sepArcsec !== b.sepArcsec) return a.sepArcsec - b.sepArcsec;
        return b.interestScore - a.interestScore;
      }

      // Default: sort by interestScore descending
      if (b.interestScore !== a.interestScore) return b.interestScore - a.interestScore;
      return a.sepArcsec - b.sepArcsec;
    });

    return sorted.map((item, idx) => ({
      ...item,
      number: idx + 1,
    }));
  }, [rawResults, filters, sortBy]);

  // Sync displayed results with parent viewer markers
  useEffect(() => {
    onResultsChangeRef.current?.(displayedResults, radiusArcmin);
  }, [displayedResults, radiusArcmin]);

  // Handle center input submit
  const handleCenterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = centerInput.trim();
    if (!query) return;

    setErrorMessage('');

    // 1. Try coordinate parsing
    const parsed = parseCoordinates(query);
    if (parsed) {
      setActiveCoords(parsed);
      return;
    }

    // 2. Try Sesame / catalog resolver
    setIsLoading(true);
    setLoadingStep(`Resolviendo nombre "${query}" en CDS Sesame...`);
    try {
      const res = await resolveTargetName(query);
      if (res) {
        setActiveCoords({ ra: res.ra, dec: res.dec });
        setCenterInput(res.name);
      } else {
        setErrorMessage(
          'No reconocimos esa ubicación. Usa coordenadas en grados (ej. 133.795 -7.245) o sexagesimal (ej. 08h55m10.8s -07d14m42s).'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // "Sorpréndeme": Cycle through curated astronomical targets
  const handleSurpriseMe = () => {
    sound.playBlip(640, 0.04);
    const nextIdx = (curatedIndex + 1) % CURATED_CONE_TARGETS.length;
    setCuratedIndex(nextIdx);
    const target = CURATED_CONE_TARGETS[nextIdx];
    setActiveCoords({ ra: target.ra, dec: target.dec });
    setCenterInput(target.name);
    setRadiusArcmin(target.defaultRadius);
  };

  // "Usar objeto actual": Reset to viewer's center
  const resetToViewerCenter = () => {
    sound.playBlip(540, 0.04);
    setActiveCoords({ ra: currentRa, dec: currentDec });
    setCenterInput(currentName);
  };

  // Filter Chip Toggle
  const toggleFilter = (f: ConeFilterType) => {
    sound.playBlip(580, 0.03);
    if (f === 'all') {
      setFilters(['all']);
      return;
    }

    let next: ConeFilterType[] = filters.filter((item) => item !== 'all');
    if (next.includes(f)) {
      next = next.filter((item) => item !== f);
    } else {
      next.push(f);
    }

    if (next.length === 0) {
      next = ['all'];
    }
    setFilters(next);
  };

  // Key navigation for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { raStr, decStr } = formatSexagesimal(activeCoords.ra, activeCoords.dec);

  // Astronomical equivalences
  const moonDiameterEquiv = ((radiusArcmin * 2) / 30.0).toFixed(1);
  const fastMoverTravel2YrArcsec = 20; // 10"/yr * 2 years
  const radiusArcsec = radiusArcmin * 60;
  const isRadiusSufficient = radiusArcsec >= fastMoverTravel2YrArcsec;

  // Logarithmic ticks for radius ruler
  const rulerTicks = [1, 2, 5, 10, 20, 30, 60];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Explorar alrededores por radio"
      className="fixed inset-0 z-40 pointer-events-auto flex justify-end transition-opacity"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Container (Desktop Sidebar / Mobile Bottom Sheet) */}
      <div
        ref={panelRef}
        className="relative z-50 w-full max-w-md md:max-w-lg bg-[#0e1126] border-l border-[#272a4f] shadow-2xl flex flex-col h-full max-md:max-h-[90vh] max-md:rounded-t-3xl max-md:mt-auto animate-slide-in text-[#f1eefb]"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#272a4f] bg-[#070914]">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5a7e] animate-pulse" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                Explorar el vecindario
              </h2>
              <p className="text-xs text-[#9a95b8] font-mono">
                Búsqueda por radio en el infrarrojo (SPHEREx / Gaia / WISE)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de exploración"
            className="w-8 h-8 rounded-full bg-[#141733] hover:bg-[#272a4f] text-[#9a95b8] hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* 1. Centro Selector */}
          <div className="bg-[#070914] border border-[#272a4f] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="center-input" className="font-bold text-white text-xs">
                Centro de observación
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetToViewerCenter}
                  className="text-[11px] text-[#ff5a7e] hover:underline font-semibold cursor-pointer"
                  title="Restablecer al objeto cargado en el visor"
                >
                  Usar objeto actual
                </button>
                <span className="text-[#3a3e68]">·</span>
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  className="text-[11px] text-[#38bdf8] hover:underline font-semibold cursor-pointer flex items-center gap-1"
                  title="Saltar a un objetivo astronómico notable"
                >
                  <span>🎲</span> Sorpréndeme
                </button>
              </div>
            </div>

            <form onSubmit={handleCenterSubmit} className="flex gap-2">
              <input
                id="center-input"
                type="text"
                value={centerInput}
                onChange={(e) => setCenterInput(e.target.value)}
                placeholder="Nombre o coords (ej. 76.956 30.401 o 05h07m49s)"
                className="flex-1 px-3 py-1.5 rounded-xl border border-[#272a4f] bg-[#0e1126] text-xs text-white placeholder-[#686482] focus:outline-none focus:border-[#ff5a7e]"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-xl bg-[#272a4f] hover:bg-[#34396b] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Fijar
              </button>
            </form>

            <div className="text-[11px] font-mono text-[#9a95b8] flex justify-between pt-0.5">
              <span>{raStr}, {decStr}</span>
              <span>({activeCoords.ra.toFixed(4)}°, {activeCoords.dec.toFixed(4)}°)</span>
            </div>
          </div>

          {/* 2. Radius Logarithmic Ruler */}
          <div className="bg-[#070914] border border-[#272a4f] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs">Radio de búsqueda</span>
              <span className="font-mono font-bold text-[#ff5a7e] text-sm">
                {radiusArcmin}′ <span className="text-[10px] text-[#9a95b8]">({radiusArcmin * 60}″)</span>
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="1"
              max="60"
              value={radiusArcmin}
              onChange={(e) => setRadiusArcmin(parseInt(e.target.value, 10))}
              aria-label="Radio de búsqueda en minutos de arco"
              className="w-full accent-[#ff5a7e] cursor-pointer"
            />

            {/* Quick tick buttons */}
            <div className="flex justify-between items-center text-[10px] text-[#9a95b8] font-mono">
              {rulerTicks.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRadiusArcmin(t)}
                  className={`px-1.5 py-0.5 rounded hover:text-white transition-colors cursor-pointer ${
                    radiusArcmin === t ? 'text-[#ff5a7e] font-bold bg-[#ff5a7e]/15' : ''
                  }`}
                >
                  {t}′
                </button>
              ))}
            </div>

            {/* Astronomical context lines (Calculadas rigurosamente) */}
            <div className="text-[11px] text-[#9a95b8] bg-[#0e1126] border border-[#1e224d] rounded-xl p-2.5 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="text-white font-semibold">Equivalencia lunar:</span>
                <span>{moonDiameterEquiv}× el diámetro de la Luna llena (~30′).</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="text-white font-semibold">Seguimiento:</span>
                <span>
                  Un objeto a 10″/año recorre {fastMoverTravel2YrArcsec}″ en dos años: este radio ({radiusArcsec}″) es{' '}
                  <strong className={isRadiusSufficient ? 'text-emerald-400' : 'text-amber-400'}>
                    {isRadiusSufficient ? 'holgadamente suficiente' : 'estrecho'}
                  </strong>{' '}
                  para seguirlo en SPHEREx.
                </span>
              </p>
            </div>
          </div>

          {/* 3. Carta Celeste del Panel */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Carta celeste del cono:</span>
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                className="text-[11px] text-[#9a95b8] hover:text-white underline cursor-pointer"
              >
                {showChart ? 'Ocultar carta' : 'Ver carta celeste'}
              </button>
            </div>

            {showChart && (
              <CelestialConeChart
                centerRa={activeCoords.ra}
                centerDec={activeCoords.dec}
                radiusArcmin={radiusArcmin}
                results={displayedResults}
                hoveredId={hoveredResultId}
                onHoverId={setHoveredResultId}
                onSelectResult={(item) => {
                  sound.playTargetSelect();
                  onSelectResult(item);
                  onClose();
                }}
                onSelectNewCenter={(coords) => {
                  sound.playBlip(520, 0.04);
                  setActiveCoords(coords);
                  setCenterInput(`${coords.ra.toFixed(4)} ${coords.dec.toFixed(4)}`);
                }}
              />
            )}
          </div>

          {/* 4. Filter Chips con contadores calculados dinámicamente */}
          <div>
            <span className="block font-bold text-white text-xs mb-2">Filtrar candidatos:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all' as ConeFilterType, label: 'Todos', count: counts.all },
                { id: 'fast' as ConeFilterType, label: 'Se mueven rápido', count: counts.fast },
                { id: 'coldcandidate' as ConeFilterType, label: 'Sin pareja en Gaia', count: counts.coldcandidate },
                { id: 'browndwarf' as ConeFilterType, label: 'Enanas marrones', count: counts.browndwarf },
                { id: 'variable' as ConeFilterType, label: 'Cambian de brillo', count: counts.variable },
              ].map((chip) => {
                const active = filters.includes(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => toggleFilter(chip.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? 'bg-[#ff5a7e] text-white border-[#ff5a7e] shadow-sm'
                        : 'bg-[#070914] text-[#9a95b8] border-[#272a4f] hover:text-white hover:border-[#9a95b8]'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        active ? 'bg-white/25 text-white' : 'bg-[#141733] text-[#9a95b8]'
                      }`}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {noticeMessage && !errorMessage && (
            <div className="text-[11px] text-[#9a95b8] italic">
              ℹ️ {noticeMessage}
            </div>
          )}

          {/* 5. Header de la Sección de Resultados con ordenación */}
          <div className="flex items-center justify-between pt-2 border-t border-[#272a4f]">
            <div>
              <span className="font-bold text-white text-xs">
                {isLoading
                  ? 'Consultando catálogos celestes…'
                  : errorMessage
                  ? 'Error en la consulta'
                  : `${displayedResults.length} objeto${displayedResults.length === 1 ? '' : 's'} en ${radiusArcmin}′`}
              </span>
              {!isLoading && !errorMessage && displayedResults.length >= 200 && (
                <span className="block text-[10px] text-[#9a95b8]">
                  Mostrando los 200 más interesantes del área
                </span>
              )}
            </div>

            {/* Sort toggle */}
            {!isLoading && displayedResults.length > 1 && (
              <div className="flex items-center gap-1 text-[11px] font-mono text-[#9a95b8]">
                <span>Ordenar:</span>
                <button
                  type="button"
                  onClick={() => setSortBy('interest')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    sortBy === 'interest' ? 'text-[#ff5a7e] font-bold bg-[#ff5a7e]/15' : 'hover:text-white'
                  }`}
                >
                  Interés
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setSortBy('distance')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    sortBy === 'distance' ? 'text-[#ff5a7e] font-bold bg-[#ff5a7e]/15' : 'hover:text-white'
                  }`}
                >
                  Distancia
                </button>
              </div>
            )}
          </div>

          {/* 6. Resultados en Formato Cuaderno de Campo (Notebook Table) */}
          {isLoading ? (
            <div className="space-y-3 py-2">
              <div className="p-4 rounded-2xl bg-[#070914] border border-[#272a4f] text-center space-y-2">
                <span className="w-4 h-4 border-2 border-[#ff5a7e] border-t-transparent rounded-full animate-spin inline-block" />
                <p className="text-xs text-[#cbd5e1] font-mono">{loadingStep}</p>
                <div className="flex justify-center gap-4 text-[10px] text-[#64748b] font-mono">
                  <span>SIMBAD (CDS)</span>
                  <span>Gaia DR3 (ESA)</span>
                  <span>CatWISE (NASA)</span>
                </div>
              </div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-[#070914] border border-[#272a4f] animate-pulse space-y-2"
                >
                  <div className="h-4 bg-[#1e224d] rounded w-2/3" />
                  <div className="h-3 bg-[#1e224d] rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800/80 text-center text-xs text-red-200 space-y-3">
              <p className="font-bold text-white text-sm">
                Error al consultar el catálogo celeste
              </p>
              <p className="text-red-200/80 text-xs">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={() => executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                <span>↻</span> Reintentar búsqueda
              </button>
            </div>
          ) : displayedResults.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#070914] border border-[#272a4f] text-center text-xs text-[#9a95b8] space-y-3">
              <p className="font-semibold text-white text-sm">
                Sin resultados en este radio
              </p>
              <p className="text-xs text-[#9a95b8] max-w-xs mx-auto">
                No encontramos objetos dentro de {radiusArcmin}′ con los filtros activos.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setRadiusArcmin(Math.min(60, Math.max(20, radiusArcmin * 2)))}
                  className="px-3.5 py-1.5 rounded-xl bg-[#272a4f] hover:bg-[#34396b] text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Sube el radio a {Math.min(60, Math.max(20, radiusArcmin * 2))}′
                </button>
                <button
                  type="button"
                  onClick={() => setFilters(['all'])}
                  className="px-3.5 py-1.5 rounded-xl bg-[#141733] hover:bg-[#272a4f] text-[#9a95b8] hover:text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Activar filtro &quot;Todos&quot;
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 pb-6">
              {displayedResults.map((item: ConeResult) => {
                const isHovered = hoveredResultId === item.id;
                const isCenter = item.sepArcsec === 0;
                const isDetailsOpen = expandedDetailsId === item.id;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredResultId(item.id)}
                    onMouseLeave={() => setHoveredResultId(null)}
                    className={`rounded-2xl border transition-all ${
                      isHovered
                        ? 'bg-[#15193b] border-[#ff5a7e] shadow-lg'
                        : isCenter
                        ? 'bg-[#111533] border-[#ffd34f]/50'
                        : 'bg-[#070914] border-[#272a4f] hover:border-[#ff5a7e]/60'
                    }`}
                  >
                    {/* Main Row Clickable Button */}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTargetSelect();
                        onSelectResult(item);
                        onClose();
                      }}
                      className="w-full text-left p-3.5 flex items-start justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Marker Number Pill */}
                        <span
                          className={`w-6 h-6 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${
                            isCenter ? 'bg-[#ffd34f] text-black' : 'bg-[#ff5a7e] text-white'
                          }`}
                        >
                          {item.number}
                        </span>

                        <div className="min-w-0">
                          {/* Name and Candidate Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-[#ff5a7e] transition-colors">
                              {item.name}
                            </h3>
                            {item.isCandidate && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ffd34f]/20 text-[#ffd34f] border border-[#ffd34f]/40 uppercase tracking-wider">
                                Candidato
                              </span>
                            )}
                            {item.isColdCandidate && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40">
                                Sin pareja en Gaia
                              </span>
                            )}
                          </div>

                          {/* Kind in human language */}
                          <p className="text-[11px] text-[#ff5a7e] font-semibold mt-0.5 truncate">
                            {item.kindLabel}
                          </p>

                          {/* Speed & Distance */}
                          <p className="text-[11px] text-[#9a95b8] mt-0.5 font-mono">
                            {formatMovementSpeed(item.pmArcsecPerYear)}
                            {item.distanceLy && ` · ${item.distanceLy}`}
                          </p>

                          {/* Scientific justification in 1 human sentence */}
                          {item.interestReason && (
                            <p className="text-[11px] text-[#cbd5e1] mt-1.5 leading-snug line-clamp-2">
                              {item.interestReason}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Distance & Score */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="block font-mono font-bold text-white text-xs">
                          {isCenter ? '0″ (Centro)' : `A ${formatSeparation(item.sepArcsec)}`}
                        </span>
                        <span className="text-[10px] text-[#9a95b8]">
                          {isCenter ? 'Referencia' : 'del centro'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-[#ff5a7e] bg-[#ff5a7e]/10 px-1.5 py-0.5 rounded border border-[#ff5a7e]/20 mt-1">
                          {item.interestScore} pts
                        </span>
                      </div>
                    </button>

                    {/* Bottom Toolbar of the Item: Catalog Sources & Raw Technical Drawer */}
                    <div className="px-3.5 pb-2.5 pt-0 flex items-center justify-between text-[10px] font-mono border-t border-[#1e224d]/60">
                      <div className="flex items-center gap-1.5 text-[#64748b]">
                        <span>Fuentes:</span>
                        <span className="px-1 py-0.2 rounded bg-[#141733] text-[#cbd5e1]">
                          {item.source === 'crossmatch' || (item.source as string) === 'federated'
                            ? 'SIMBAD + Gaia'
                            : item.source.toUpperCase()}
                        </span>
                        {item.w1MinusW2 !== undefined && (
                          <span className="px-1 py-0.2 rounded bg-[#141733] text-[#38bdf8]">
                            CatWISE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {onHuntArea && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sound.playTargetSelect();
                              onSelectResult(item);
                              onHuntArea();
                              onClose();
                            }}
                            className="text-[#facc15] hover:underline font-semibold cursor-pointer"
                          >
                            ★ Cazar en visor
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDetailsId(isDetailsOpen ? null : item.id);
                          }}
                          className="text-[#9a95b8] hover:text-white underline cursor-pointer"
                        >
                          {isDetailsOpen ? 'Ocultar datos' : 'Datos técnicos'}
                        </button>
                      </div>
                    </div>

                    {/* Raw Scientific Parameters Drawer */}
                    {isDetailsOpen && (
                      <div className="px-3.5 pb-3 pt-2 bg-[#070914] rounded-b-2xl border-t border-[#1e224d] text-[10px] font-mono text-[#9a95b8] grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[#64748b] block">RA / Dec (ICRS):</span>
                          <span className="text-white">{item.ra.toFixed(5)}°, {item.dec.toFixed(5)}°</span>
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Movimiento propio:</span>
                          <span className="text-white">
                            pmRA: {item.pmRa.toFixed(1)} mas/a · pmDE: {item.pmDec.toFixed(1)} mas/a
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Tipo de objeto SIMBAD:</span>
                          <span className="text-white">{item.kindCode} ({item.kindLabel})</span>
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Color infrarrojo W1−W2:</span>
                          <span className="text-white">
                            {item.w1MinusW2 !== undefined ? `${item.w1MinusW2.toFixed(2)} mag` : 'No medido'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
