import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '../game/types';

export type GpsMode = 'live' | 'manual';

export interface GpsFix extends LatLng {
  accuracyMeters: number;
  headingDeg: number | null;
  speedMps: number;
}

const DEFAULT_FALLBACK_CENTER: GpsFix = {
  lat: 37.7694, // Golden Gate Park, SF
  lng: -122.4862,
  accuracyMeters: 10,
  headingDeg: null,
  speedMps: 0,
};

export function useGeolocation() {
  const [mode, setMode] = useState<GpsMode>('live');
  const [status, setStatus] = useState<'locating' | 'active' | 'denied' | 'manual'>('locating');
  const [position, setPosition] = useState<GpsFix>(DEFAULT_FALLBACK_CENTER);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode === 'manual') {
      setStatus('manual');
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('denied');
      setMode('manual');
      return;
    }

    setStatus('locating');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('active');
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy || 10),
          headingDeg: pos.coords.heading ?? null,
          speedMps: pos.coords.speed ?? 0,
        });
      },
      () => {
        setStatus('denied');
        setMode('manual');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 8000,
      },
    );

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mode]);

  const stepManualPosition = useCallback(
    (northMeters: number, eastMeters: number, speedMultiplier = 1.0) => {
      setMode('manual');
      setPosition((prev) => {
        const dLat = (northMeters * speedMultiplier) / 111_320;
        const dLng =
          (eastMeters * speedMultiplier) /
          (111_320 * Math.cos((prev.lat * Math.PI) / 180));
        return {
          lat: Number((prev.lat + dLat).toFixed(6)),
          lng: Number((prev.lng + dLng).toFixed(6)),
          accuracyMeters: 5,
          headingDeg:
            northMeters !== 0 || eastMeters !== 0
              ? Math.round((Math.atan2(eastMeters, northMeters) * 180) / Math.PI)
              : prev.headingDeg,
          speedMps: Number((3.2 * speedMultiplier).toFixed(1)),
        };
      });
    },
    [],
  );

  const setManualLatLng = useCallback((lat: number, lng: number) => {
    setMode('manual');
    setPosition((prev) => ({
      ...prev,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      accuracyMeters: 5,
    }));
  }, []);

  return {
    mode,
    setMode,
    status,
    position,
    stepManualPosition,
    setManualLatLng,
  };
}
