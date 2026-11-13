'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveTargetName } from '../lib/sesame';
import { formatSexagesimal } from '../lib/wcs';
import { sound } from '../lib/sound';
import { LandingHero } from '../components/LandingHero';
import { MapModal } from '../components/MapModal';
import { RetoModal } from '../components/RetoModal';
import { GuidedTour } from '../components/GuidedTour';
import { ConeSearchPanel } from '../components/ConeSearchPanel';
import { SpectrumViewer } from '../components/SpectrumViewer';
import { useFrameData, preloadTargets } from '../lib/useFrameData';
import { renderScientificFrame } from '../lib/renderEngine';
import { getCatalogMarkers } from '../lib/mockData';
import { ContaminationFlag } from '../lib/types';
import { Locale, DICTIONARY } from '../lib/i18n';
import { exportTimelapseGif, exportDiscoveryCard } from '../lib/exportUtils';
import {
  ConeResult,
  ConeFilterType,
  formatMovementSpeed,
  formatSeparation,
} from '../lib/coneSearch';

/* ============================================================ */
/* TIPOS Y DATOS VERIFICADOS CIENTÍFICAMENTE                   */
/* ============================================================ */

export interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  icon: string;
  badge: string;
  pm: [number, number];
  pmRaMasYr: number;
  pmDecMasYr: number;
  f: [string, string][];
  peak: number;
  ra: number;
  dec: number;
  fitsId: string;
  mjd: number;
}

const OBJ: Record<string, AstronomicalObject> = {
  wise: {
    id: 'wise',
    n: 'WISE 0855-0714',
    tag: 'La enana marrón más fría conocida (~250 K)',
    hook: 'Casi no tiene luz visible, pero brilla en el infrarrojo medio de SPHEREx. Mira cómo cruza el cielo frente a las estrellas fijas.',
    type: 'mov',
    icon: '',
    badge: 'Enana Marrón Sub-Estelar',
    pm: [-1, 0.2],
    pmRaMasYr: -8150.0,
    pmDecMasYr: 540.0,
    f: [['Distancia', '7,3 años luz'], ['Temperatura', '−23 °C (250 K)'], ['Se mueve', '8,1″ al año']],
    peak: 0.75,
    ra: 133.7951,
    dec: -7.2451,
    fitsId: 'SPHX_E1_D5_WISE0855',
    mjd: 60841.5,
  },
  barnard: {
    id: 'barnard',
    n: 'Estrella de Barnard',
    tag: 'El récord de velocidad propia en el cielo',
    hook: 'Es una enana roja vecina (M4V). Se desplaza hacia el Norte a más de 10 segundos de arco al año.',
    type: 'mov',
    icon: '',
    badge: 'Alto Movimiento Propio',
    pm: [0.15, -1],
    pmRaMasYr: -802.8,
    pmDecMasYr: 10362.5,
    f: [['Distancia', '5,96 años luz'], ['Tipo', 'Enana roja M4V'], ['Se mueve', '10,36″ al año']],
    peak: 0.35,
    ra: 269.4521,
    dec: 4.6933,
    fitsId: 'SPHX_E1_D2_BARNARD',
    mjd: 60841.5,
  },
  indi: {
    id: 'indi',
    n: 'Epsilon Indi B',
    tag: 'Par binario de enanas marrones frías (T1 + T6)',
    hook: 'Dos "estrellas fallidas" que orbitan juntas a 12 años luz. Su atmósfera muestra fuerte absorción de metano y vapor de agua.',
    type: 'pair',
    icon: '',
    badge: 'Par Binario T1+T6',
    pm: [0.9, 0.5],
    pmRaMasYr: 3961.0,
    pmDecMasYr: -2539.0,
    f: [['Distancia', '11,8 años luz'], ['Espectro', 'Metano (CH₄)'], ['Se mueve', '4,7″ al año']],
    peak: 0.6,
    ra: 331.0438,
    dec: -56.7828,
    fitsId: 'SPHX_E1_D3_EPSINDI',
    mjd: 60841.5,
  },
  rw: {
    id: 'rw',
    n: 'RW Aurigae',
    tag: 'Estrella T Tauri con eclipses de polvo',
    hook: 'No se desplaza rápido: su brillo térmico cambia drásticamente debido a corrientes de gas y polvo en su disco protoplanetario.',
    type: 'var',
    icon: '',
    badge: 'Variable T Tauri',
    pm: [0, 0],
    pmRaMasYr: 1.2,
    pmDecMasYr: -22.4,
    f: [['Distancia', '450 años luz'], ['Tipo', 'Estrella joven (T Tauri)'], ['Cambia', 'Eclipses térmicos']],
    peak: 0.4,
    ra: 76.9564,
    dec: 30.4014,
    fitsId: 'SPHX_E1_D1_RWAUR',
    mjd: 60841.5,
  },
  rdra: {
    id: 'rdra',
    n: 'R Draconis',
    tag: 'Gigante roja pulsante Mira (Periodo 245 d)',
    hook: 'Pasa de ser una de las estrellas más brillantes a casi apagarse. Su espectro molecular de 102 bandas cambia de pendiente en cada época.',
    type: 'var',
    icon: '',
    badge: 'Gigante Pulsante Mira',
    pm: [0, 0],
    pmRaMasYr: -14.8,
    pmDecMasYr: 12.3,
    f: [['Distancia', '~1 000 años luz'], ['Tipo', 'Gigante roja AGB'], ['Ciclo', '245 días']],
    peak: 0.3,
    ra: 248.1676,
    dec: 66.7551,
    fitsId: 'SPHX_E1_D4_RDRA',
    mjd: 60841.5,
  },
};

const DATES = ['Jun 2025', 'Dic 2025', 'Jun 2026', 'Dic 2026'];
const BANDS: [string, string][] = [
  ['Det 1', '0,75–1,11 µm'],
  ['Det 2', '1,11–1,64 µm'],
  ['Det 3', '1,64–2,42 µm'],
  ['Det 4', '2,42–3,82 µm'],
  ['Det 5', '3,82–4,42 µm'],
  ['Det 6', '4,42–5,00 µm'],
];
const BAND_COLORS = ['#6aa7ff', '#4fd1a5', '#ffd34f', '#ff9a3c', '#d44f6e', '#b07cff'];

/* ============================================================ */
/* COMPONENTE PRINCIPAL                                           */
/* ============================================================ */

export default function Home() {
  const [view, setView] = useState<'landing' | 'viewer'>('landing');
  const [locale, setLocale] = useState<Locale>('es');
  const t = DICTIONARY[locale];

  const [key, setKey] = useState<string>('wise');
  const [target, setTarget] = useState<AstronomicalObject>(OBJ.wise);
  const [playing, setPlaying] = useState<boolean>(true);
  const [time, setTime] = useState<number>(0);
  const [highlight, setHighlight] = useState<boolean>(true);
  const [fov, setFov] = useState<number>(5);
  const [contrast, setContrast] = useState<number>(65);
  const [bandOn, setBandOn] = useState<boolean[]>([true, true, true, true, true, true]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isEmbed, setIsEmbed] = useState<boolean>(false);

  // FASE 3: Features Estrella
  const [blinkMode, setBlinkMode] = useState<boolean>(false);
  const [blinkHz, setBlinkHz] = useState<number>(2.0); // 1.0 to 4.0 Hz
  const [curtainEnabled, setCurtainEnabled] = useState<boolean>(false);
  const [curtainSplit, setCurtainSplit] = useState<number>(0.5); // 0.0 to 1.0
  const [isDraggingCurtain, setIsDraggingCurtain] = useState<boolean>(false);
  const [autoHunterEnabled, setAutoHunterEnabled] = useState<boolean>(false);
  const [selectedWavelength, setSelectedWavelength] = useState<number>(2.4); // 0.75 to 5.0 µm
  const [exportingGif, setExportingGif] = useState<boolean>(false);
  const [exportGifStatus, setExportGifStatus] = useState<string>('');

  // Scientific Instrument Settings (Fase 2)
  const [displayMode, setDisplayMode] = useState<'normal' | 'diff' | 'stack'>('normal');
  const [diffRef, setDiffRef] = useState<'first' | 'previous'>('first');
  const [stretchFn, setStretchFn] = useState<'asinh' | 'log' | 'linear'>('asinh');
  const [colormapType, setColormapType] = useState<'inferno' | 'viridis' | 'greyscale'>('inferno');
  const [showCatalogOverlays, setShowCatalogOverlays] = useState<boolean>(true);
  const [activeFlags, setActiveFlags] = useState<ContaminationFlag[]>([]);

  // Modals & Panels
  const [isMapOpen, setIsMapOpen] = useState<boolean>(false);
  const [isRetoOpen, setIsRetoOpen] = useState<boolean>(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [isConeSearchOpen, setIsConeSearchOpen] = useState<boolean>(false);
  const [coneResults, setConeResults] = useState<ConeResult[]>([]);
  const [coneRadius, setConeRadius] = useState<number>(10);
  const [coneFilters, setConeFilters] = useState<ConeFilterType[]>(['all']);

  const [retoFound, setRetoFound] = useState<boolean>(false);
  const [retoScore, setRetoScore] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTsRef = useRef<number>(0);

  // Hook de recortes reales de SPHEREx con precarga y reintento
  const { framesResponse, loading: isFrameLoading, error: frameError, retry: retryFrames } = useFrameData({
    ra: target.ra,
    dec: target.dec,
    fov,
    targetName: target.n,
  });

  // Detector de estado de red
  const [isOffline, setIsOffline] = useState<boolean>(false);
  useEffect(() => {
    const handleOff = () => setIsOffline(true);
    const handleOn = () => setIsOffline(false);
    window.addEventListener('offline', handleOff);
    window.addEventListener('online', handleOn);
    if (typeof navigator !== 'undefined' && !navigator.onLine) setIsOffline(true);
    return () => {
      window.removeEventListener('offline', handleOff);
      window.removeEventListener('online', handleOn);
    };
  }, []);

  // Precarga proactiva en segundo plano de todos los objetos para transiciones instantáneas
  useEffect(() => {
    preloadTargets(
      Object.values(OBJ).map((o) => ({
        ra: o.ra,
        dec: o.dec,
        fov: 5.0,
        targetName: o.n,
      }))
    );
  }, []);

  // Cross-match de catálogos Gaia DR3 (2016) y CatWISE2020 (2020)
  const catalogMarkers = useMemo(() => {
    return framesResponse ? getCatalogMarkers(framesResponse) : [];
  }, [framesResponse]);

  // Motion reduction check
  const noMotion = useRef(false);
  useEffect(() => {
    noMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Carga de objetivo
  const loadTarget = useCallback((k: string) => {
    const o = OBJ[k] || OBJ.wise;
    setKey(k);
    setTarget(o);
    setTime(0);
    setSearchMessage('');
    setRetoFound(false);
    setCurtainEnabled(false);
    setBlinkMode(false);
    setAutoHunterEnabled(false);

    if (typeof window !== 'undefined') {
      history.replaceState(null, '', '#' + k);
    }
  }, []);

  /* URL params sync (Supports deep-linking, shareable state, ?embed=1) */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const search = new URLSearchParams(window.location.search);
    const raParam = search.get('ra');
    const decParam = search.get('dec');
    const rParam = search.get('r');
    const fParam = search.get('f');
    const embedParam = search.get('embed');
    const modeParam = search.get('mode');
    const langParam = search.get('lang');

    if (embedParam === '1') setIsEmbed(true);
    if (langParam === 'en' || langParam === 'es') setLocale(langParam);
    if (modeParam === 'diff' || modeParam === 'stack' || modeParam === 'normal') {
      setDisplayMode(modeParam);
    }

    if (raParam && decParam) {
      const raVal = parseFloat(raParam);
      const decVal = parseFloat(decParam);
      const radVal = parseFloat(rParam || '10') || 10;

      if (!isNaN(raVal) && !isNaN(decVal)) {
        setConeRadius(radVal);
        if (fParam) {
          if (fParam === 'rapidos' || fParam === 'fast') setConeFilters(['fast']);
          else if (fParam === 'enanas' || fParam === 'browndwarf') setConeFilters(['browndwarf']);
          else if (fParam === 'variables' || fParam === 'variable') setConeFilters(['variable']);
          else setConeFilters(['all']);
        }
        const matchedPresetKey = Object.keys(OBJ).find(
          (k) => Math.hypot(OBJ[k].ra - raVal, OBJ[k].dec - decVal) < 0.05
        );
        if (matchedPresetKey) {
          loadTarget(matchedPresetKey);
        } else {
          const customObj: AstronomicalObject = {
            id: `custom_${raVal.toFixed(3)}_${decVal.toFixed(3)}`,
            n: `Centro (${raVal.toFixed(3)}°, ${decVal.toFixed(3)}°)`,
            tag: 'Coordenadas seleccionadas para exploración por radio',
            hook: 'Vecindario celeste consultado con SPHEREx y catálogos estelares.',
            type: 'mov',
            icon: '',
            badge: 'Área explorada',
            pm: [-0.4, 0.3],
            pmRaMasYr: -2500,
            pmDecMasYr: 1500,
            f: [['RA', `${raVal.toFixed(3)}°`], ['Dec', `${decVal.toFixed(3)}°`], ['Radio', `${radVal}′`]],
            peak: 0.5,
            ra: raVal,
            dec: decVal,
            fitsId: `SPHX_CONE_${raVal.toFixed(2)}_${decVal.toFixed(2)}`,
            mjd: 60841.5,
          };
          setTarget(customObj);
          setKey(customObj.id);
        }
        setView('viewer');
        setIsConeSearchOpen(true);
        return;
      }
    }

    if (hash && OBJ[hash]) {
      loadTarget(hash);
      setView('viewer');
    } else if (search.has('target') || search.has('q')) {
      const q = search.get('target') || search.get('q') || '';
      if (q && OBJ[q]) loadTarget(q);
      setView('viewer');
    }
  }, [loadTarget]);

  const handleSelectObject = (k: string) => {
    loadTarget(k);
    setView('viewer');
    try {
      if (!localStorage.getItem('spherex_tour_seen')) setIsTourOpen(true);
    } catch { /* ignore */ }
  };

  const handleSelectConeResult = (item: ConeResult) => {
    const presetKey = Object.keys(OBJ).find(
      (k) => OBJ[k].n.toLowerCase() === item.name.toLowerCase() ||
        Math.hypot(OBJ[k].ra - item.ra, OBJ[k].dec - item.dec) < 0.005
    );

    if (presetKey) {
      loadTarget(presetKey);
    } else {
      const isVar = item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.kindLabel.toLowerCase().includes('cambia');
      const isBrownDwarf = item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
      const scalePm = item.pmArcsecPerYear > 0 ? Math.min(1.8, Math.max(0.2, item.pmArcsecPerYear / 2.0)) : 0.3;
      const pmX = item.pmRa !== 0 ? (item.pmRa / Math.hypot(item.pmRa, item.pmDec || 1)) * scalePm : 0;
      const pmY = item.pmDec !== 0 ? (item.pmDec / Math.hypot(item.pmRa || 1, item.pmDec)) * scalePm : 0;

      const newTarget: AstronomicalObject = {
        id: item.id,
        n: item.name,
        tag: item.kindLabel,
        hook: isBrownDwarf
          ? 'Enana marrón detectada en el infrarrojo profundo. Observa su desplazamiento en el cielo mientras las estrellas lejanas están fijas.'
          : isVar
          ? 'Estrella variable: fíjate en cómo cambia su brillo en las cuatro épocas de SPHEREx.'
          : 'Objeto detectado en el radio de búsqueda con el telescopio espacial SPHEREx.',
        type: isVar ? 'var' : 'mov',
        icon: '',
        badge: item.kindLabel,
        pm: isVar ? [0, 0] : [pmX, -pmY],
        pmRaMasYr: item.pmRa || 0,
        pmDecMasYr: item.pmDec || 0,
        f: [
          ['Distancia', item.distanceLy || 'En catálogo'],
          ['Movimiento', formatMovementSpeed(item.pmArcsecPerYear)],
          ['Separación', formatSeparation(item.sepArcsec)],
        ],
        peak: isBrownDwarf ? 0.75 : isVar ? 0.4 : 0.5,
        ra: item.ra,
        dec: item.dec,
        fitsId: `SPHX_OBJ_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        mjd: 60841.5,
      };

      setTarget(newTarget);
      setKey(item.id);
      setTime(0);
      setPlaying(true);
    }

    if (typeof window !== 'undefined') {
      const fSlug = coneFilters.includes('fast') ? 'rapidos'
        : coneFilters.includes('browndwarf') ? 'enanas'
        : coneFilters.includes('variable') ? 'variables'
        : 'todos';
      history.replaceState(null, '', `?ra=${item.ra.toFixed(4)}&dec=${item.dec.toFixed(4)}&r=${coneRadius}&f=${fSlug}`);
    }
  };

  /* ---- Main Canvas Draw (Científico con renderEngine) ---- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!framesResponse || !framesResponse.frames.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#07090f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const res = renderScientificFrame({
      canvas,
      frames: framesResponse.frames,
      epochFloat: time,
      activeDetectors: bandOn,
      mode: displayMode,
      diffRef,
      stretch: stretchFn,
      colormap: colormapType,
      contrast,
      highlight,
      targetName: target.n,
      targetType: target.type,
      wcs: framesResponse.wcs,
      fovArcmin: fov,
      catalogMarkers,
      showCatalogOverlays,
      coneResults,
      coneRadiusArcmin: coneRadius,
      isConeSearchOpen,
      curtainEnabled,
      curtainSplit,
      autoHunterEnabled,
      timeTravelGaiaWise: true,
    });

    setActiveFlags(res.flags);
  }, [
    framesResponse,
    time,
    bandOn,
    displayMode,
    diffRef,
    stretchFn,
    colormapType,
    contrast,
    highlight,
    target.n,
    target.type,
    fov,
    catalogMarkers,
    showCatalogOverlays,
    coneResults,
    coneRadius,
    isConeSearchOpen,
    curtainEnabled,
    curtainSplit,
    autoHunterEnabled,
  ]);

  /* ---- Loop continuo de reproducción ---- */
  useEffect(() => {
    if (view !== 'viewer') return;
    let animId: number;

    const loop = (ts: number) => {
      if (blinkMode) {
        // Fast alternating blink mode (e.g. 2 Hz -> alternates epoch 0 and 3)
        const periodMs = 1000.0 / blinkHz;
        const phase = Math.floor(ts / periodMs) % 2;
        setTime(phase === 0 ? 0 : 3);
      } else if (playing && !noMotion.current && !curtainEnabled) {
        setTime((prev) => {
          const delta = (ts - lastTsRef.current) / 1600.0;
          return (prev + delta) % 3.0;
        });
      }
      lastTsRef.current = ts;
      draw();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [view, playing, blinkMode, blinkHz, curtainEnabled, draw]);

  /* ---- Keyboard Shortcuts Completo (Space, B, D, C, H, Arrows) ---- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setBlinkMode((b) => !b);
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        setDisplayMode((m) => (m === 'diff' ? 'normal' : 'diff'));
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        setCurtainEnabled((c) => !c);
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        setAutoHunterEnabled((h) => !h);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        setTime((t) => Math.min(3, Math.round(t + 1)));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        setTime((t) => Math.max(0, Math.round(t - 1)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ---- Curtain / Split mouse drag interaction on canvas ---- */
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (curtainEnabled) {
      setIsDraggingCurtain(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const xRatio = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      setCurtainSplit(xRatio);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (curtainEnabled && isDraggingCurtain) {
      const rect = e.currentTarget.getBoundingClientRect();
      const xRatio = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      setCurtainSplit(xRatio);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCurtain(false);
  };

  /* ---- Canvas Click: Detective Mode & Cone Search Marker Selection ---- */
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (curtainEnabled) return; // Do not trigger target click while dragging curtain

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = 560.0 / rect.width;
    const cx = (e.clientX - rect.left) * scaleFactor;
    const cy = (e.clientY - rect.top) * scaleFactor;

    // 1. Click en marcador de búsqueda por radio
    if (coneResults.length > 0) {
      const cosDec = Math.cos((target.dec * Math.PI) / 180.0);
      const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;
      const pxPerArcmin = 560.0 / fov;

      for (const item of coneResults.slice(0, 20)) {
        const dRaArcmin = (item.ra - target.ra) * safeCosDec * 60.0;
        const dDecArcmin = (item.dec - target.dec) * 60.0;
        const mx = 280 - dRaArcmin * pxPerArcmin;
        const my = 280 - dDecArcmin * pxPerArcmin;
        if (Math.hypot(cx - mx, cy - my) <= 16) {
          sound.playTargetSelect();
          handleSelectConeResult(item);
          return;
        }
      }
    }

    // 2. Click sobre el objeto en movimiento (Modo Detective)
    const currEpochIdx = Math.max(0, Math.min(3, Math.round(time)));
    const frameSize = framesResponse?.frames[0]?.width || 256;
    const pxScale = 560.0 / frameSize;

    let targetScreenX = 280;
    let targetScreenY = 280;

    if (framesResponse && framesResponse.frames.length > 0) {
      const currFrame = framesResponse.frames.find((f) => f.epochIndex === currEpochIdx) || framesResponse.frames[0];
      if (currFrame.movingTargetPixel) {
        targetScreenX = currFrame.movingTargetPixel.x * pxScale;
        targetScreenY = currFrame.movingTargetPixel.y * pxScale;
      }
    }

    if (Math.hypot(cx - targetScreenX, cy - targetScreenY) <= 42) {
      sound.playDetectiveFound();
      setRetoFound(true);
      setRetoScore((prev) => prev + 100);
      setIsRetoOpen(true);
    }
  };

  /* ---- Search Handler ---- */
  const handleSearch = async (queryStr: string) => {
    const q = queryStr.trim().toLowerCase();
    if (!q) return;

    const foundKey = Object.keys(OBJ).find(
      (k) => OBJ[k].n.toLowerCase().includes(q) || k.includes(q) || (q === 'wise 0855' && k === 'wise')
    );
    if (foundKey) {
      handleSelectObject(foundKey);
      setSearchQuery('');
      return;
    }

    try {
      setIsSearching(true);
      const res = await resolveTargetName(queryStr);
      if (res) {
        OBJ['custom'] = {
          id: 'custom',
          n: res.name,
          tag: 'Objeto resuelto en catálogo SIMBAD/CDS',
          hook: res.description || 'Coordenadas astronómicas identificadas en catálogo.',
          type: 'mov',
          icon: '',
          badge: 'Objeto astronómico',
          pm: [-0.6, 0.4],
          pmRaMasYr: -3000,
          pmDecMasYr: 2000,
          f: [['RA', `${res.ra.toFixed(3)}°`], ['Dec', `${res.dec.toFixed(3)}°`], ['Origen', res.source]],
          peak: 0.5,
          ra: res.ra,
          dec: res.dec,
          fitsId: `SPHX_CAT_${res.name.replace(/\s+/g, '')}`,
          mjd: 60841.5,
        };
        handleSelectObject('custom');
        setSearchQuery('');
      } else {
        setSearchMessage(`No encontramos "${queryStr}". Prueba con uno de los ejemplos sugeridos.`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  /* ---- Export GIF Handler ---- */
  const handleExportGif = async () => {
    if (!framesResponse || !framesResponse.frames.length) return;
    try {
      setExportingGif(true);
      await exportTimelapseGif({
        frames: framesResponse.frames,
        wcs: framesResponse.wcs,
        targetName: target.n,
        colormap: colormapType,
        stretch: stretchFn,
        contrast,
        activeDetectors: bandOn,
        onProgress: (msg) => setExportGifStatus(msg),
      });
    } finally {
      setExportingGif(false);
      setExportGifStatus('');
    }
  };

  /* ---- Export Discovery Card Handler ---- */
  const handleExportCard = () => {
    if (!canvasRef.current) return;
    const mv = target.f.find(([lbl]) => lbl.includes('mueve') || lbl.includes('Movimiento'))?.[1] || '';
    const dist = target.f.find(([lbl]) => lbl.includes('Distancia'))?.[1] || '';
    exportDiscoveryCard({
      canvasElement: canvasRef.current,
      targetName: target.n,
      category: target.badge,
      raStr,
      decStr,
      distanceLy: dist,
      pmSpeed: mv,
    });
  };

  const copyShareLink = () => {
    if (typeof window !== 'undefined') {
      const modeParam = displayMode !== 'normal' ? `&mode=${displayMode}` : '';
      const shareUrl = `${window.location.origin}/?ra=${target.ra.toFixed(4)}&dec=${target.dec.toFixed(4)}&fov=${fov}&lang=${locale}${modeParam}#${key}`;
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const currEpochIdx = Math.max(0, Math.min(3, Math.round(time)));
  const { raStr, decStr } = formatSexagesimal(target.ra, target.dec);

  /* ============================================================ */
  /* RENDER                                                         */
  /* ============================================================ */
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>

      {/* ============ PORTADA ============ */}
      {view === 'landing' && !isEmbed ? (
        <LandingHero
          objects={OBJ}
          onSelect={handleSelectObject}
          onSearch={handleSearch}
          onOpenConeSearch={() => { setView('viewer'); setIsConeSearchOpen(true); }}
          isSearching={isSearching}
          searchMessage={searchMessage}
        />
      ) : (
        /* ============ VISOR CIENTÍFICO (Fase 1, 2 y 3) ============ */
        <>
          {/* Cabecera (Se oculta en modo ?embed=1) */}
          {!isEmbed && (
            <header
              style={{
                height: 'var(--header-h)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '0 16px',
                borderBottom: '1px solid var(--line)',
                backgroundColor: 'var(--panel)',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 30,
                flexShrink: 0,
              }}
            >
              {/* Volver / Logo */}
              <button
                onClick={() => { setView('landing'); if (typeof window !== 'undefined') history.replaceState(null, '', ' '); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  padding: '4px 0',
                  flexShrink: 0,
                }}
                title={t.backToHome}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1rem',
                    fontWeight: 400,
                    display: 'none',
                  }}
                  className="sm-show"
                >
                  SPHEREx Time Machine
                </span>
              </button>

              {/* Buscador */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSearch(searchQuery); }}
                style={{ flex: 1, maxWidth: 300, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  style={{
                    flex: 1,
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    background: 'var(--panel-raised)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-caption)',
                    outline: 'none',
                    minWidth: 0,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--acc)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                />
              </form>

              {/* Acciones derechas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {/* Selector Bilingüe ES / EN */}
                <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setLocale('es')}
                    style={{
                      padding: '3px 7px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: locale === 'es' ? 'var(--acc)' : 'transparent',
                      color: locale === 'es' ? '#fff' : 'var(--mute)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    ES
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocale('en')}
                    style={{
                      padding: '3px 7px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: locale === 'en' ? 'var(--acc)' : 'transparent',
                      color: locale === 'en' ? '#fff' : 'var(--mute)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    EN
                  </button>
                </div>

                {/* Explorar Radio */}
                <button
                  onClick={() => setIsConeSearchOpen(true)}
                  className="btn-ghost"
                  title={t.exploreConeBtn}
                  style={{ fontSize: 'var(--text-data)', padding: '5px 10px' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <span style={{ display: 'none' }} className="sm-show">Explorar</span>
                  {coneResults.length > 0 && (
                    <span style={{
                      padding: '0 5px',
                      borderRadius: 10,
                      background: 'rgba(79,209,165,0.2)',
                      color: '#4fd1a5',
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {coneResults.length}
                    </span>
                  )}
                </button>

                {/* Tour guiado */}
                <button
                  onClick={() => setIsTourOpen(true)}
                  className="btn-icon"
                  title={t.guidedTourBtn}
                  aria-label={t.guidedTourBtn}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>?</span>
                </button>

                {/* Compartir */}
                <button
                  onClick={copyShareLink}
                  className="btn-ghost"
                  title={t.shareBtn}
                  style={{ fontSize: 'var(--text-data)', padding: '5px 10px' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                  </svg>
                  <span>{copiedLink ? t.copiedTooltip : t.shareBtn}</span>
                </button>
              </div>
            </header>
          )}

          {/* Cinta espectral (6 detectores) */}
          <div className="spectral-ribbon" role="presentation" aria-hidden="true" />

          {/* Mensaje de búsqueda */}
          {searchMessage && (
            <div
              role="status"
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--acc)',
                background: 'var(--panel)',
                borderBottom: '1px solid var(--line)',
                padding: '6px 16px',
                textAlign: 'center',
              }}
            >
              {searchMessage}
            </div>
          )}

          {/* Aviso modo sin conexión */}
          {isOffline && (
            <div
              role="status"
              style={{
                fontSize: '0.72rem',
                color: '#facc15',
                background: 'rgba(250, 204, 21, 0.12)',
                borderBottom: '1px solid rgba(250, 204, 21, 0.3)',
                padding: '4px 16px',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              Modo sin conexión: visualizando datos precargados desde la memoria local.
            </div>
          )}

          {/* Error de carga de fotogramas con botón Reintentar */}
          {frameError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 'var(--text-caption)',
                color: '#f87171',
                background: 'rgba(248, 113, 113, 0.12)',
                borderBottom: '1px solid rgba(248, 113, 113, 0.3)',
                padding: '6px 16px',
              }}
            >
              <span>{frameError}</span>
              <button
                type="button"
                onClick={retryFrames}
                className="btn-ghost"
                style={{ fontSize: '0.72rem', padding: '2px 8px', borderColor: '#f87171', color: '#f87171' }}
              >
                Reintentar
              </button>
            </div>
          )}

          {/* ===== SHELL DEL VISOR ===== */}
          <div className="viewer-shell">
            <div className="viewer-body">

              {/* Columna izquierda: canvas científico + barra de herramientas estelar */}
              <div className="viewer-canvas-col" id="tour-canvas-area">
                <div className="viewer-canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={560}
                    onClick={handleCanvasClick}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    className="sky-canvas"
                    aria-label="Imagen infrarroja científica de SPHEREx (mosaico de 256x256 píxeles honestos)"
                    style={{
                      cursor: curtainEnabled ? 'ew-resize' : 'crosshair',
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      userSelect: 'none',
                    }}
                  />

                  {/* Estado de carga */}
                  {isFrameLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(7, 9, 15, 0.75)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          border: '2px solid var(--acc)',
                          borderTopColor: 'transparent',
                          animation: 'pulse-ring 1.2s infinite linear',
                        }}
                      />
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink)' }}>
                        Cargando 24 fotogramas científicos de SPHEREx…
                      </div>
                    </div>
                  )}

                  {/* Exportando GIF status */}
                  {exportingGif && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(7, 9, 15, 0.85)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        zIndex: 40,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          border: '2px solid #ffd34f',
                          borderTopColor: 'transparent',
                          animation: 'pulse-ring 1.2s infinite linear',
                        }}
                      />
                      <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: '#ffffff' }}>
                        {t.generatingGif}
                      </div>
                      <div style={{ fontSize: 'var(--text-caption)', color: '#ffd34f' }}>
                        {exportGifStatus}
                      </div>
                    </div>
                  )}

                  {/* Badge de tipo de astro */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: 12,
                      background: 'rgba(7,9,15,0.78)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 20,
                      padding: '3px 10px',
                      fontSize: 'var(--text-data)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--ink)',
                    }}
                  >
                    <span
                      className="pulse-ring"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--acc)',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {target.badge}
                  </div>

                  {/* Alerta de bandera de contaminación */}
                  {activeFlags.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 12,
                        top: 42,
                        background: 'rgba(245, 158, 11, 0.15)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(245, 158, 11, 0.45)',
                        borderRadius: 20,
                        padding: '2px 9px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: '#fcd34d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                      title="Bandera de calidad astronómica en este fotograma"
                    >
                      <span>⚡</span>
                      <span>Artefacto: {activeFlags.join(', ')}</span>
                    </div>
                  )}

                  {/* Badge de radio de búsqueda */}
                  {coneResults.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 12,
                        background: 'rgba(7,9,15,0.85)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79,209,165,0.3)',
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: 'var(--text-data)',
                        fontWeight: 700,
                        color: '#4fd1a5',
                      }}
                    >
                      Radio {coneRadius}′ · {coneResults.length} objetos
                    </div>
                  )}

                  {/* Floating Action Bar inside canvas (Fase 3: Parpadeo / Cortina / Cazador) */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 12,
                      bottom: 12,
                      display: 'flex',
                      gap: 6,
                      background: 'rgba(7, 9, 15, 0.82)',
                      backdropFilter: 'blur(8px)',
                      padding: '4px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                    }}
                  >
                    {/* Blink comparator toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        setCurtainEnabled(false);
                        setBlinkMode((b) => !b);
                      }}
                      title="Alternar rápidamente entre épocas para ver movimiento (Tecla B)"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 5,
                        border: `1px solid ${blinkMode ? 'var(--acc)' : 'transparent'}`,
                        background: blinkMode ? 'var(--acc)' : 'transparent',
                        color: blinkMode ? '#fff' : 'var(--ink)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>⚡</span>
                      <span>{t.blinkBtn}</span>
                    </button>

                    {/* Split curtain wipe toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        setBlinkMode(false);
                        setCurtainEnabled((c) => !c);
                      }}
                      title="Comparar dos épocas dividiendo la pantalla con una cortina arrastrable (Tecla C)"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 5,
                        border: `1px solid ${curtainEnabled ? '#ffd34f' : 'transparent'}`,
                        background: curtainEnabled ? '#ffd34f22' : 'transparent',
                        color: curtainEnabled ? '#ffd34f' : 'var(--ink)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>↔</span>
                      <span>Cortina</span>
                    </button>

                    {/* Auto-hunter candidate detector */}
                    <button
                      type="button"
                      onClick={() => setAutoHunterEnabled((h) => !h)}
                      title="Detección automática de candidatos a objetos móviles en el cliente (Tecla H)"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 5,
                        border: `1px solid ${autoHunterEnabled ? '#facc15' : 'transparent'}`,
                        background: autoHunterEnabled ? '#facc1522' : 'transparent',
                        color: autoHunterEnabled ? '#facc15' : 'var(--ink)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>★</span>
                      <span>Cazador</span>
                    </button>
                  </div>
                </div>

                {/* Playbar con cinta espectral interactiva como rail */}
                <div className="viewer-playbar">
                  <button
                    onClick={() => {
                      setBlinkMode(false);
                      setCurtainEnabled(false);
                      setPlaying(!playing);
                    }}
                    aria-label={playing ? 'Pausar' : 'Reproducir'}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'var(--acc)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {playing ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    )}
                  </button>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
                      <div className="spectral-ribbon-thin" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 0 }} />
                      <input
                        type="range"
                        min="0"
                        max="300"
                        value={Math.round(time * 100)}
                        onChange={(e) => {
                          setBlinkMode(false);
                          setCurtainEnabled(false);
                          setPlaying(false);
                          setTime(parseFloat(e.target.value) / 100.0);
                        }}
                        aria-label="Línea de tiempo entre épocas"
                        style={{ position: 'relative', zIndex: 1, width: '100%', background: 'transparent' }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 'var(--text-data)',
                        color: 'var(--mute)',
                      }}
                    >
                      {DATES.map((d, idx) => (
                        <span
                          key={d}
                          style={{
                            color: idx === currEpochIdx ? 'var(--acc)' : 'var(--mute)',
                            fontWeight: idx === currEpochIdx ? 700 : 400,
                          }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna derecha: información y controles científicos */}
              <aside className="viewer-info-col">
                <div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-heading)',
                      fontWeight: 400,
                      lineHeight: 1.15,
                      margin: '0 0 4px',
                      color: 'var(--ink)',
                    }}
                  >
                    {target.n}
                  </h2>
                  <p style={{ color: 'var(--acc)', fontWeight: 600, fontSize: 'var(--text-body)', margin: '0 0 8px' }}>
                    {target.tag}
                  </p>
                  <p style={{ color: 'var(--ink)', fontSize: 'var(--text-caption)', lineHeight: 1.55, margin: 0 }}>
                    {target.hook}
                  </p>
                </div>

                {/* Facts verificados con citas */}
                <div
                  style={{
                    display: 'flex',
                    gap: 20,
                    flexWrap: 'wrap',
                    padding: '10px 0',
                    borderTop: '1px solid var(--line)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  {target.f.map(([label, val]) => (
                    <div key={label}>
                      <div
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: 'var(--ink)',
                          lineHeight: 1.2,
                        }}
                      >
                        {val}
                      </div>
                      <div style={{ fontSize: 'var(--text-data)', color: 'var(--mute)' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Acciones principales: Reto, Mapa y Exportaciones */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    onClick={() => setIsRetoOpen(true)}
                    className="btn-primary"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    {t.retoBtn}
                  </button>

                  <button
                    onClick={() => setIsMapOpen(true)}
                    className="btn-ghost"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/>
                    </svg>
                    Contexto Aladin
                  </button>

                  {/* Exportar GIF animado */}
                  <button
                    onClick={handleExportGif}
                    disabled={exportingGif}
                    className="btn-ghost"
                    title="Exportar GIF animado de 4 épocas con marca SPHEREx"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    {t.exportGifBtn}
                  </button>

                  {/* Ficha de hallazgo PNG para redes */}
                  <button
                    onClick={handleExportCard}
                    className="btn-ghost"
                    title="Descargar Ficha Telegrama de Detección para compartir"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {t.exportCardBtn}
                  </button>
                </div>

                {/* Interruptor principal: "Resaltar lo que cambia" */}
                <div
                  id="tour-highlight-switch"
                  style={{
                    background: 'var(--panel-raised)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink)',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={highlight}
                      onChange={(e) => setHighlight(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--acc)', cursor: 'pointer' }}
                    />
                    {t.highlightSwitch}
                  </label>
                  <p style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', margin: '6px 0 0 28px' }}>
                    {target.type === 'var' ? t.highlightSwitchDescVar : t.highlightSwitchDescMov}
                  </p>
                </div>

                {/* ========================================================= */}
                {/* PANEL PLEGABLE: CONTROLES DE INSTRUMENTO CIENTÍFICO       */}
                {/* ========================================================= */}
                <details style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <summary
                    style={{
                      fontWeight: 600,
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span>{t.instrumentControls}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </summary>

                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Modo de Visualización (Normal / Diferencia / Apilado) */}
                    <div>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>
                        {t.imageMode}
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { id: 'normal', label: t.modeNormal, desc: t.modeNormalDesc },
                          { id: 'diff', label: t.modeDiff, desc: t.modeDiffDesc },
                          { id: 'stack', label: t.modeStack, desc: t.modeStackDesc },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setCurtainEnabled(false);
                              setDisplayMode(m.id as any);
                            }}
                            style={{
                              padding: '6px 4px',
                              borderRadius: 6,
                              border: `1px solid ${displayMode === m.id ? 'var(--acc)' : 'var(--line)'}`,
                              background: displayMode === m.id ? 'var(--acc)' : 'transparent',
                              color: displayMode === m.id ? '#ffffff' : 'var(--ink)',
                              fontSize: 'var(--text-data)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                            }}
                          >
                            <span>{m.label}</span>
                            <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 400 }}>{m.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Estiramiento (Stretch) */}
                    <div>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>
                        {t.stretchLabel}
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { id: 'asinh', label: t.stretchAsinh },
                          { id: 'log', label: t.stretchLog },
                          { id: 'linear', label: t.stretchLinear },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setStretchFn(s.id as any)}
                            style={{
                              padding: '5px 4px',
                              borderRadius: 6,
                              border: `1px solid ${stretchFn === s.id ? 'var(--acc)' : 'var(--line)'}`,
                              background: stretchFn === s.id ? 'rgba(212,79,110,0.2)' : 'transparent',
                              color: stretchFn === s.id ? 'var(--acc-hi)' : 'var(--mute)',
                              fontSize: 'var(--text-data)',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Paleta de Color */}
                    <div>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>
                        {t.colormapLabel}
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { id: 'inferno', label: t.colormapInferno },
                          { id: 'viridis', label: t.colormapViridis },
                          { id: 'greyscale', label: t.colormapGrey },
                        ].map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setColormapType(c.id as any)}
                            style={{
                              padding: '5px 4px',
                              borderRadius: 6,
                              border: `1px solid ${colormapType === c.id ? 'var(--acc)' : 'var(--line)'}`,
                              background: colormapType === c.id ? 'rgba(212,79,110,0.2)' : 'transparent',
                              color: colormapType === c.id ? 'var(--acc-hi)' : 'var(--mute)',
                              fontSize: 'var(--text-data)',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* C. EL CIELO EN OTRO COLOR (Wavelength slider & Presets) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)' }}>
                          {t.wavelengthSlider}:
                        </span>
                        <span style={{ fontSize: 'var(--text-data)', color: '#ffd34f', fontWeight: 700 }}>
                          {selectedWavelength.toFixed(2)} µm
                        </span>
                      </div>

                      {/* Continuous Wavelength Slider */}
                      <input
                        type="range"
                        min="0.75"
                        max="5.0"
                        step="0.05"
                        value={selectedWavelength}
                        onChange={(e) => {
                          const w = parseFloat(e.target.value);
                          setSelectedWavelength(w);
                          // Activate corresponding detector
                          const activeIdx = w < 1.11 ? 0 : w < 1.64 ? 1 : w < 2.42 ? 2 : w < 3.82 ? 3 : w < 4.42 ? 4 : 5;
                          const next = [false, false, false, false, false, false];
                          next[activeIdx] = true;
                          setBandOn(next);
                        }}
                        style={{ width: '100%', marginBottom: 8 }}
                      />

                      {/* Human-language spectral presets */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWavelength(0.95);
                            setBandOn([true, false, false, false, false, false]);
                          }}
                          className="btn-ghost"
                          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                        >
                          {t.presetOptical}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWavelength(4.4);
                            setBandOn([false, false, false, false, true, true]);
                          }}
                          className="btn-ghost"
                          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                        >
                          {t.presetThermal}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWavelength(2.5);
                            setBandOn([true, true, true, true, true, true]);
                          }}
                          className="btn-ghost"
                          style={{ fontSize: '0.68rem', padding: '3px 8px', borderColor: 'var(--acc)', color: 'var(--acc-hi)' }}
                        >
                          {t.presetSumAll}
                        </button>
                      </div>
                    </div>

                    {/* FOV y Contraste */}
                    <div>
                      <label
                        htmlFor="fov"
                        style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', display: 'block', marginBottom: 4 }}
                      >
                        {t.fovLabel}{' '}
                        <span style={{ color: 'var(--ink)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fov}′</span>
                      </label>
                      <input
                        id="fov"
                        type="range"
                        min="1"
                        max="30"
                        value={fov}
                        onChange={(e) => setFov(parseInt(e.target.value, 10))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="contrast"
                        style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', display: 'block', marginBottom: 4 }}
                      >
                        {t.contrastLabel}
                      </label>
                      <input
                        id="contrast"
                        type="range"
                        min="30"
                        max="100"
                        value={contrast}
                        onChange={(e) => setContrast(parseInt(e.target.value, 10))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Toggle de catálogos */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                      <input
                        id="cat-overlay"
                        type="checkbox"
                        checked={showCatalogOverlays}
                        onChange={(e) => setShowCatalogOverlays(e.target.checked)}
                        style={{ accentColor: 'var(--acc)', cursor: 'pointer' }}
                      />
                      <label htmlFor="cat-overlay" style={{ fontSize: 'var(--text-caption)', color: 'var(--ink)', cursor: 'pointer' }}>
                        {t.catalogOverlayLabel}
                      </label>
                    </div>

                  </div>
                </details>

                {/* ========================================================= */}
                {/* PANEL PLEGABLE: ESPECTRO DE 102 BANDAS CIENTÍFICO         */}
                {/* ========================================================= */}
                <details style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <summary
                    style={{
                      fontWeight: 600,
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span>{t.spectrumSummary}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </summary>

                  <div style={{ marginTop: 10 }}>
                    <SpectrumViewer
                      ra={target.ra}
                      dec={target.dec}
                      fov={fov}
                      targetName={target.n}
                      targetType={target.type}
                      epochIndex={currEpochIdx}
                      bandOn={bandOn}
                      cachedFrames={framesResponse || undefined}
                    />
                  </div>
                </details>

                {/* ========================================================= */}
                {/* PANEL PLEGABLE: DETALLES TÉCNICOS (METADATOS FITS / WCS) */}
                {/* ========================================================= */}
                <details style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <summary
                    style={{
                      fontWeight: 500,
                      fontSize: 'var(--text-caption)',
                      color: 'var(--mute)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span>{t.fitsSummary}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </summary>

                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {[
                      ['TELESCOP', 'SPHEREx (NASA MIDEX All-Sky Spectral Survey)'],
                      ['INSTRUME', 'SPHEREx Infrared Imager (6 H2RG HgCdTe Arrays)'],
                      ['WCS-PROJ', 'TAN (Gnomonic Tangent Plane Projection)'],
                      ['FITS-ID', target.fitsId],
                      ['J2000 COORD', `${raStr}, ${decStr}`],
                      ['DECIMAL DEG', `${target.ra.toFixed(4)}°, ${target.dec.toFixed(4)}°`],
                      ['PROPER-MOTION', `${target.pmRaMasYr.toFixed(1)} mas/yr, ${target.pmDecMasYr.toFixed(1)} mas/yr`],
                      ['GRID-SIZE', '256 × 256 píxeles nativos de recorte'],
                      ['SPECTRAL', '102 bandas continuas (R ~ 40 a 130)'],
                      ['MJD-EPOCH1', target.mjd.toFixed(1)],
                      ['ATRIBUCIÓN', 'SIMBAD CDS / Gaia DR3 / CatWISE2020'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span className="coord" style={{ minWidth: 105, flexShrink: 0, color: 'var(--mute)' }}>{k}:</span>
                        <span className="coord">{v}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <p style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', marginTop: 4 }}>
                  {t.provenanceFooter}
                </p>
              </aside>
            </div>
          </div>
        </>
      )}

      {/* Paneles laterales y modales */}
      <ConeSearchPanel
        isOpen={isConeSearchOpen}
        onClose={() => setIsConeSearchOpen(false)}
        currentRa={target.ra}
        currentDec={target.dec}
        currentName={target.n}
        onSelectResult={handleSelectConeResult}
        onResultsChange={(results, rad) => { setConeResults(results); setConeRadius(rad); }}
        initialRadius={coneRadius}
        initialFilters={coneFilters}
      />

      <GuidedTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        targetName={target.n}
        isVariable={target.type === 'var'}
      />

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        target={target}
        fov={fov}
      />

      <RetoModal
        isOpen={isRetoOpen}
        onClose={() => setIsRetoOpen(false)}
        target={target}
        found={retoFound}
        score={retoScore}
      />
    </div>
  );
}
