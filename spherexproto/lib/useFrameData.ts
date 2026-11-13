import { useState, useEffect, useRef, useCallback } from 'react';
import { FramesResponse, Query } from './types';
import { api } from './apiAdapter';

interface UseFrameDataParams {
  ra: number;
  dec: number;
  fov: number;
  targetName?: string;
}

interface UseFrameDataResult {
  framesResponse: FramesResponse | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

// In-memory global cache across hook re-renders and target transitions
const cache = new Map<string, FramesResponse>();

/**
 * Proactively preloads celestial fields in the background during idle time
 */
export function preloadTargets(
  targets: { ra: number; dec: number; fov: number; targetName?: string }[]
) {
  if (typeof window === 'undefined') return;

  const runPreload = () => {
    targets.forEach((t) => {
      const key = `${t.ra.toFixed(4)}_${t.dec.toFixed(4)}_${t.fov.toFixed(1)}_${t.targetName || ''}`;
      if (!cache.has(key)) {
        api.getFrames({ ra: t.ra, dec: t.dec, fov: t.fov, targetName: t.targetName })
          .then((res) => {
            cache.set(key, res);
          })
          .catch(() => {
            // silent ignore on idle preload
          });
      }
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runPreload, { timeout: 1500 });
  } else {
    setTimeout(runPreload, 200);
  }
}

export function useFrameData({
  ra,
  dec,
  fov,
  targetName,
}: UseFrameDataParams): UseFrameDataResult {
  const [framesResponse, setFramesResponse] = useState<FramesResponse | null>(() => {
    const key = `${ra.toFixed(4)}_${dec.toFixed(4)}_${fov.toFixed(1)}_${targetName || ''}`;
    return cache.get(key) || null;
  });
  const [loading, setLoading] = useState<boolean>(!framesResponse);
  const [error, setError] = useState<string | null>(null);

  const activeKeyRef = useRef<string>('');

  const fetchFrames = useCallback(() => {
    const key = `${ra.toFixed(4)}_${dec.toFixed(4)}_${fov.toFixed(1)}_${targetName || ''}`;
    activeKeyRef.current = key;

    if (cache.has(key)) {
      setFramesResponse(cache.get(key)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const query: Query = { ra, dec, fov, targetName };

    api.getFrames(query)
      .then((res) => {
        if (activeKeyRef.current === key) {
          cache.set(key, res);
          setFramesResponse(res);
          setLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        if (activeKeyRef.current === key) {
          setError(err instanceof Error ? err.message : 'Error al cargar fotogramas de SPHEREx');
          setLoading(false);
        }
      });
  }, [ra, dec, fov, targetName]);

  useEffect(() => {
    fetchFrames();
  }, [fetchFrames]);

  return { framesResponse, loading, error, retry: fetchFrames };
}
