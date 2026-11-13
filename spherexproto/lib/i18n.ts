export type Locale = 'es' | 'en';

export const DICTIONARY = {
  es: {
    // Historical motto
    motto: 'Así se descubrió Plutón: alternando dos fotos del mismo cielo.',
    heroTitle1: 'El cielo no está quieto.',
    heroTitle2: 'Mira cómo se mueve.',
    heroDesc: 'Imágenes infrarrojas del telescopio SPHEREx de la NASA, tomadas en cuatro fechas distintas. Los objetos cercanos cruzan el cielo — los lejanos se quedan fijos.',
    heroTableObject: 'Objeto',
    heroTableSpeed: 'Velocidad',
    searchPlaceholder: 'O escribe un objeto (ej. Proxima Cen, 133.79 −7.24)…',
    searchBtn: 'Buscar',
    exploreConeBtn: 'Explorar una zona del cielo por radio',
    backToHome: 'Volver a la portada',
    shareBtn: 'Compartir',
    copiedTooltip: '¡Copiado!',
    guidedTourBtn: 'Tour guiado',

    // Blink & Comparator
    blinkBtn: 'Parpadeo (B)',
    blinkSpeed: 'Velocidad de parpadeo',
    curtainToggle: 'Cortina comparadora (Lado a lado)',
    curtainLabelEpoch1: 'Época 1 (Jun 2025)',
    curtainLabelEpoch4: 'Época 4 (Dic 2026)',

    // Auto-hunter
    autoHunterBtn: 'Cazador automático de candidatos',
    autoHunterFound: 'Candidato a objeto en movimiento',
    autoHunterEstimatedDisp: 'Desplazamiento estimado',

    // Spectral ribbon slider
    wavelengthSlider: 'Longitud de onda infrarroja',
    presetOptical: 'Casi visible (0,75–1,1 µm)',
    presetThermal: 'Calor térmico (3,8–5,0 µm)',
    presetSumAll: 'Sumar colores para ver lo tenue',

    // Time Travel with Gaia & WISE
    timeTravelGaia: 'Gaia DR3 (2016)',
    timeTravelWise: 'WISE (2020)',
    timeTravelMovedText: 'Desde 2016 se movió',

    // Instrument controls
    instrumentControls: 'Controles de instrumento científico',
    imageMode: 'Modo de procesamiento de imagen:',
    modeNormal: 'Normal',
    modeNormalDesc: 'Directo',
    modeDiff: 'Diferencia',
    modeDiffDesc: 'Dipolo',
    modeStack: 'Apilado',
    modeStackDesc: 'Co-adición',
    stretchLabel: 'Estiramiento de flujo (Stretch astronómico):',
    stretchAsinh: 'Asinh (Científico)',
    stretchLog: 'Logarítmico',
    stretchLinear: 'Lineal',
    colormapLabel: 'Paleta de falso color:',
    colormapInferno: 'Inferno',
    colormapViridis: 'Viridis',
    colormapGrey: 'Escala de grises',
    activeDetectors: 'Detectores SPHEREx activos (0,75 – 5,00 µm):',
    fovLabel: 'Campo de visión (FOV):',
    contrastLabel: 'Ganancia de contraste',
    catalogOverlayLabel: 'Comparar con marcas de Gaia DR3 (2016) y WISE (2020)',
    highlightSwitch: 'Resaltar lo que cambia',
    highlightSwitchDescVar: 'Señala la variación temporal de flujo y oculta artefactos estáticos.',
    highlightSwitchDescMov: 'Dibuja la trayectoria orbital esperada y retículas de catálogos.',

    // Spectrum
    spectrumSummary: 'Ver su huella infrarroja (102 canales)',
    spectrumCsvBtn: 'CSV (102 bandas)',
    spectrumHoverWavelength: 'Longitud de onda',
    spectrumHoverFlux: 'Flujo',

    // Detective Challenge
    retoBtn: 'Reto Detective: ¿Dónde está?',
    retoScore: 'Puntos',
    retoAccurate: '¡Excelente puntería! Error de solo',

    // Export & Sharing
    exportGifBtn: 'Descargar GIF',
    exportCardBtn: 'Tarjeta de Hallazgo',
    generatingGif: 'Codificando GIF89a astronómico…',

    // FITS Details
    fitsSummary: 'Cabecera FITS y Calibración WCS',
    provenanceFooter: 'Modelo astrofísico verificado: 24 fotogramas calculados con calibración WCS TAN, matriz Float32Array y catálogo Gaia DR3 / WISE2020.',

    // Cone Search & Neighborhood Exploration
    coneTitle: 'Explorar alrededores',
    coneSubtitle: 'Búsqueda por radio en el vecindario celeste',
    coneCenterLabel: 'Centro de búsqueda',
    coneBackToCurrent: 'Volver al objeto actual',
    coneSurpriseMe: 'Sorpréndeme',
    coneRadiusLabel: 'Distancia desde el centro',
    coneFilterTitle: 'Filtrar por tipo de objeto:',
    coneSortLabel: 'Ordenar por:',
    coneSortInterest: 'Interés científico',
    coneSortDistance: 'Distancia al centro',
    coneHuntArea: 'Cazar movimiento en esta zona',
    coneShowChart: 'Ver carta celeste',
    coneHideChart: 'Ocultar carta',
    coneEmptyTitle: 'Sin resultados en este radio',
    coneEmptySuggestion: 'Sube el radio a',
    coneErrorTitle: 'Error al consultar el catálogo celeste',
    coneRetry: 'Reintentar búsqueda',
    coneTechnicalDetails: 'Datos técnicos',
    coneMarkersToggle: 'Marcadores de cono',
  },
  en: {
    // Historical motto
    motto: 'How Pluto was discovered: by blinking two photos of the same sky.',
    heroTitle1: 'The sky is not still.',
    heroTitle2: 'Watch it move.',
    heroDesc: 'Infrared cutouts from NASA’s SPHEREx space telescope across four survey epochs. Nearby brown dwarfs and asteroids rush through while distant stars remain frozen.',
    heroTableObject: 'Target',
    heroTableSpeed: 'Velocity',
    searchPlaceholder: 'Or search target / coords (e.g. Proxima Cen, 133.79 −7.24)…',
    searchBtn: 'Search',
    exploreConeBtn: 'Cone Search Sky Neighborhood',
    backToHome: 'Back to Index',
    shareBtn: 'Share',
    copiedTooltip: 'Copied!',
    guidedTourBtn: 'Guided Tour',

    // Blink & Comparator
    blinkBtn: 'Blink (B)',
    blinkSpeed: 'Blink Rate',
    curtainToggle: 'Split Curtain (Side-by-side)',
    curtainLabelEpoch1: 'Epoch 1 (Jun 2025)',
    curtainLabelEpoch4: 'Epoch 4 (Dec 2026)',

    // Auto-hunter
    autoHunterBtn: 'Auto-Hunter (Candidate Detector)',
    autoHunterFound: 'Candidate moving object',
    autoHunterEstimatedDisp: 'Estimated displacement',

    // Spectral ribbon slider
    wavelengthSlider: 'Infrared Wavelength',
    presetOptical: 'Near-Visible (0.75–1.1 µm)',
    presetThermal: 'Thermal IR (3.8–5.0 µm)',
    presetSumAll: 'Stack all colors to reveal faint sources',

    // Time Travel with Gaia & WISE
    timeTravelGaia: 'Gaia DR3 (2016)',
    timeTravelWise: 'WISE (2020)',
    timeTravelMovedText: 'Since 2016 displaced by',

    // Instrument controls
    instrumentControls: 'Scientific Instrument Controls',
    imageMode: 'Image processing mode:',
    modeNormal: 'Normal',
    modeNormalDesc: 'Direct',
    modeDiff: 'Difference',
    modeDiffDesc: 'Dipole',
    modeStack: 'Stacked',
    modeStackDesc: 'Co-add',
    stretchLabel: 'Flux Stretch Function:',
    stretchAsinh: 'Asinh (Scientific)',
    stretchLog: 'Logarithmic',
    stretchLinear: 'Linear',
    colormapLabel: 'False Colormap:',
    colormapInferno: 'Inferno',
    colormapViridis: 'Viridis',
    colormapGrey: 'Greyscale',
    activeDetectors: 'Active SPHEREx Detectors (0.75 – 5.00 µm):',
    fovLabel: 'Field of View (FOV):',
    contrastLabel: 'Contrast Gain',
    catalogOverlayLabel: 'Cross-match with Gaia DR3 (2016) and WISE (2020)',
    highlightSwitch: 'Highlight Transient Signals',
    highlightSwitchDescVar: 'Tracks temporal flux pulsation and dampens static background.',
    highlightSwitchDescMov: 'Renders predicted orbital trajectory and catalog reticles.',

    // Spectrum
    spectrumSummary: 'Infrared Molecular Spectrum (102 bands)',
    spectrumCsvBtn: 'CSV (102 bands)',
    spectrumHoverWavelength: 'Wavelength',
    spectrumHoverFlux: 'Flux',

    // Detective Challenge
    retoBtn: 'Detective Quest: Spot the Target',
    retoScore: 'Score',
    retoAccurate: 'Spot on! Angular offset of only',

    // Export & Sharing
    exportGifBtn: 'Export GIF',
    exportCardBtn: 'Telegram Card',
    generatingGif: 'Encoding astronomical GIF89a…',

    // FITS Details
    fitsSummary: 'FITS Header & WCS Calibration',
    provenanceFooter: 'Verified astrophysical pipeline: 24 frames computed with TAN WCS projection, Float32Array pixel buffers, and Gaia DR3 / WISE2020 catalogs.',

    // Cone Search & Neighborhood Exploration
    coneTitle: 'Explore Neighborhood',
    coneSubtitle: 'Radial cone search in sky neighborhood',
    coneCenterLabel: 'Search Center',
    coneBackToCurrent: 'Return to current target',
    coneSurpriseMe: 'Surprise me',
    coneRadiusLabel: 'Distance from center',
    coneFilterTitle: 'Filter by object type:',
    coneSortLabel: 'Sort by:',
    coneSortInterest: 'Scientific interest',
    coneSortDistance: 'Distance from center',
    coneHuntArea: 'Hunt motion in this region',
    coneShowChart: 'Show sky chart',
    coneHideChart: 'Hide sky chart',
    coneEmptyTitle: 'No objects found in this radius',
    coneEmptySuggestion: 'Increase radius to',
    coneErrorTitle: 'Error querying astronomical catalog',
    coneRetry: 'Retry search',
    coneTechnicalDetails: 'Technical data',
    coneMarkersToggle: 'Cone search markers',
  },
};

