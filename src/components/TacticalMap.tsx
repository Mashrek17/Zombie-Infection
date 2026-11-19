import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  InfoWindow,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Navigation, Radio } from 'lucide-react';
import { ROLES } from '../game/roles';
import {
  haversineDistanceMeters,
  metersToMiles,
  milesToMeters,
} from '../game/rules';
import type {
  Barrier,
  ClientRoomView,
  ClientVisiblePlayer,
  LatLng,
} from '../game/types';
import { RoleIcon, formatSecondsClock } from './RoleBadgeIcon';

interface TacticalMapProps {
  mapsApiKey: string;
  room: ClientRoomView;
  selfPlayer: ClientVisiblePlayer | null;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  onMapClickCoordinate?: (lat: number, lng: number) => void;
  manualMode: boolean;
}

interface MapCircleProps {
  center: LatLng;
  radiusMeters: number;
  strokeColor: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor: string;
  fillOpacity?: number;
  clickable?: boolean;
}

interface MapsCircleHandle {
  setMap: (map: unknown) => void;
  setCenter: (center: LatLng) => void;
  setRadius: (radius: number) => void;
  setOptions: (options: Record<string, unknown>) => void;
}

function MapCircleOverlay({
  center,
  radiusMeters,
  strokeColor,
  strokeOpacity = 0.85,
  strokeWeight = 2,
  fillColor,
  fillOpacity = 0.1,
  clickable = false,
}: MapCircleProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const circleRef = useRef<MapsCircleHandle | null>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;
    const CircleCtor = (
      mapsLib as unknown as {
        Circle: new (opts: Record<string, unknown>) => MapsCircleHandle;
      }
    ).Circle;
    const circle = new CircleCtor({
      map,
      center,
      radius: radiusMeters,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      fillColor,
      fillOpacity,
      clickable,
    });
    circleRef.current = circle;
    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, mapsLib]);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setCenter(center);
    circleRef.current.setRadius(radiusMeters);
    circleRef.current.setOptions({
      strokeColor,
      strokeOpacity,
      strokeWeight,
      fillColor,
      fillOpacity,
    });
  }, [
    center,
    radiusMeters,
    strokeColor,
    strokeOpacity,
    strokeWeight,
    fillColor,
    fillOpacity,
  ]);

  return null;
}

function GoogleMapInner({
  room,
  selfPlayer,
  selectedPlayerId,
  onSelectPlayer,
  onMapClickCoordinate,
  manualMode,
  onFallbackNeeded,
}: Omit<TacticalMapProps, 'mapsApiKey'> & { onFallbackNeeded: () => void }) {
  const status = useApiLoadingStatus();
  const map = useMap();
  const [infoPlayerId, setInfoPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (
      status === APILoadingStatus.FAILED ||
      status === APILoadingStatus.AUTH_FAILURE
    ) {
      onFallbackNeeded();
    }
  }, [status, onFallbackNeeded]);

  const now = room.serverNow || Date.now();
  const radiusMeters = milesToMeters(room.config.radiusMiles);

  const infoPlayer = useMemo(
    () => room.players.find((p) => p.id === infoPlayerId) ?? null,
    [room.players, infoPlayerId],
  );

  const centerOnSelf = () => {
    if (!map || !selfPlayer || selfPlayer.lat === null || selfPlayer.lng === null) {
      map?.panTo(room.config.center);
      return;
    }
    map.panTo({ lat: selfPlayer.lat, lng: selfPlayer.lng });
  };

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        defaultCenter={room.config.center}
        defaultZoom={room.config.radiusMiles >= 3 ? 12 : 14}
        mapId="DEMO_MAP_ID"
        colorScheme="DARK"
        gestureHandling="greedy"
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => {
          if (manualMode && e.detail.latLng && onMapClickCoordinate) {
            onMapClickCoordinate(e.detail.latLng.lat, e.detail.latLng.lng);
          } else {
            setInfoPlayerId(null);
            onSelectPlayer(null);
          }
        }}
      >
        {/* Play zone perimeter circle (up to 5 miles) */}
        <MapCircleOverlay
          center={room.config.center}
          radiusMeters={radiusMeters}
          strokeColor="#f59e0b"
          strokeOpacity={0.9}
          strokeWeight={2.5}
          fillColor="#f59e0b"
          fillOpacity={0.04}
        />

        {/* Defender Quarantine Barriers */}
        {room.barriers.map((barrier: Barrier) => (
          <MapCircleOverlay
            key={barrier.id}
            center={{ lat: barrier.lat, lng: barrier.lng }}
            radiusMeters={barrier.radiusMeters}
            strokeColor="#fb923c"
            strokeOpacity={0.95}
            strokeWeight={2}
            fillColor="#f97316"
            fillOpacity={0.22}
          />
        ))}

        {/* Active Medic Adrenaline Surge & Tank Lockdown Auras */}
        {room.players.map((p) => {
          if (p.lat === null || p.lng === null) return null;
          if (p.abilityActiveUntil <= now) return null;
          if (p.role === 'medic') {
            return (
              <MapCircleOverlay
                key={`aura_${p.id}`}
                center={{ lat: p.lat, lng: p.lng }}
                radiusMeters={ROLES.medic.effectRadiusMeters}
                strokeColor="#10b981"
                strokeWeight={2}
                fillColor="#10b981"
                fillOpacity={0.18}
              />
            );
          }
          if (p.role === 'tank') {
            return (
              <MapCircleOverlay
                key={`aura_${p.id}`}
                center={{ lat: p.lat, lng: p.lng }}
                radiusMeters={ROLES.tank.effectRadiusMeters}
                strokeColor="#ef4444"
                strokeWeight={2}
                fillColor="#ef4444"
                fillOpacity={0.18}
              />
            );
          }
          return null;
        })}

        {/* Last Known 2-Minute Radar Pings for Hidden Survivors */}
        {room.players.map((p) => {
          if (!p.locationHidden || !p.lastKnownPing) return null;
          return (
            <AdvancedMarker
              key={`ping_${p.id}`}
              position={p.lastKnownPing}
              title={`Last 2m radar ping: ${p.name}`}
              onClick={() => {
                setInfoPlayerId(p.id);
                onSelectPlayer(p.id);
              }}
            >
              <div className="relative flex flex-col items-center">
                <span className="px-1.5 py-0.5 mb-1 text-[10px] font-mono bg-amber-950/90 text-amber-300 border border-amber-500/50 rounded whitespace-nowrap">
                  2M PING · {p.name}
                </span>
                <div className="w-6 h-6 rounded-full border-2 border-dashed border-amber-400 bg-amber-500/20 flex items-center justify-center">
                  <Radio className="w-3 h-3 text-amber-300" aria-hidden="true" />
                </div>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Live Visible Player Markers */}
        {room.players.map((p) => {
          if (p.locationHidden || p.lat === null || p.lng === null) return null;
          const isSelf = p.id === selfPlayer?.id;
          const isInfectedPending = p.infectionStatus === 'infected_pending';
          const isZombie = p.team === 'zombie';
          const isSelected = p.id === selectedPlayerId;
          const roleDef = ROLES[p.role];
          const reviveRemainingSec =
            isInfectedPending && p.infectedPendingUntil
              ? Math.max(0, Math.ceil((p.infectedPendingUntil - now) / 1000))
              : 0;

          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.name} (${roleDef.name})`}
              onClick={() => {
                setInfoPlayerId(p.id);
                onSelectPlayer(p.id);
              }}
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div
                  className={`px-2 py-0.5 mb-1 rounded text-[11px] font-medium whitespace-nowrap shadow-md border tabular-nums ${
                    isInfectedPending
                      ? 'bg-amber-950/95 text-amber-200 border-amber-400'
                      : isZombie
                        ? 'bg-red-950/95 text-red-100 border-red-500/60'
                        : 'bg-emerald-950/95 text-emerald-100 border-emerald-500/60'
                  } ${isSelected ? 'ring-2 ring-white' : ''}`}
                >
                  {isSelf ? `YOU · ${p.name}` : p.name}
                  {isInfectedPending ? ` · REVIVE ${formatSecondsClock(reviveRemainingSec)}` : ''}
                </div>
                <div className="relative flex items-center justify-center">
                  {(p.abilityActiveUntil > now || isInfectedPending) && (
                    <span
                      className={`absolute inset-0 rounded-full animate-radar-ring ${
                        isInfectedPending
                          ? 'bg-amber-400/50'
                          : isZombie
                            ? 'bg-red-500/40'
                            : 'bg-emerald-400/40'
                      }`}
                    />
                  )}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-lg ${
                      isInfectedPending
                        ? 'bg-amber-500 border-amber-100 text-slate-950'
                        : isZombie
                          ? 'bg-red-600 border-red-200 text-white'
                          : 'bg-emerald-600 border-emerald-200 text-white'
                    } ${isSelf ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-950' : ''}`}
                  >
                    <RoleIcon role={p.role} className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </AdvancedMarker>
          );
        })}

        {infoPlayer && infoPlayer.lat !== null && infoPlayer.lng !== null && (
          <InfoWindow
            position={{ lat: infoPlayer.lat, lng: infoPlayer.lng }}
            onCloseClick={() => setInfoPlayerId(null)}
          >
            <div className="text-slate-900 p-1 min-w-[160px]">
              <p className="font-bold text-sm">{infoPlayer.name}</p>
              <p className="text-xs text-slate-600">
                {infoPlayer.team === 'zombie' ? 'Infected' : 'Survivor'} ·{' '}
                {ROLES[infoPlayer.role].name}
              </p>
              {selfPlayer &&
                selfPlayer.lat !== null &&
                selfPlayer.lng !== null &&
                infoPlayer.id !== selfPlayer.id && (
                  <p className="text-xs font-mono mt-1 text-slate-800">
                    {Math.round(
                      haversineDistanceMeters(
                        { lat: selfPlayer.lat, lng: selfPlayer.lng },
                        { lat: infoPlayer.lat, lng: infoPlayer.lng },
                      ),
                    )}
                    m away
                  </p>
                )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      <button
        type="button"
        onClick={centerOnSelf}
        aria-label="Center map on my position"
        className="absolute bottom-24 right-4 z-10 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-[#13191f]/95 border border-white/15 text-slate-100 hover:bg-slate-800 flex items-center gap-2 text-xs font-medium shadow-lg cursor-pointer"
      >
        <Crosshair className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span className="hidden sm:inline">Re-center</span>
      </button>
    </div>
  );
}

/**
 * Interactive Tactical Vector Radar Fallback
 * Renders when Google Maps API key is unavailable or blocked in offline/hermetic environments.
 */
function TacticalRadarVectorFallback({
  room,
  selfPlayer,
  selectedPlayerId,
  onSelectPlayer,
  onMapClickCoordinate,
  manualMode,
}: Omit<TacticalMapProps, 'mapsApiKey'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const now = room.serverNow || Date.now();
  const radiusMeters = milesToMeters(room.config.radiusMiles);

  const projectToPercent = (point: LatLng) => {
    const metersPerDegLat = 111_320;
    const metersPerDegLng =
      111_320 * Math.cos((room.config.center.lat * Math.PI) / 180);
    const dy = (point.lat - room.config.center.lat) * metersPerDegLat;
    const dx = (point.lng - room.config.center.lng) * metersPerDegLng;
    // Fit 1.18x zone radius inside the 100% radar square
    const maxSpan = radiusMeters * 1.18;
    const xPct = 50 + (dx / maxSpan) * 45;
    const yPct = 50 - (dy / maxSpan) * 45;
    return {
      xPct: Math.min(96, Math.max(4, xPct)),
      yPct: Math.min(96, Math.max(4, yPct)),
    };
  };

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!manualMode || !onMapClickCoordinate || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 100;
    const relY = ((e.clientY - rect.top) / rect.height) * 100;
    const maxSpan = radiusMeters * 1.18;
    const dx = ((relX - 50) / 45) * maxSpan;
    const dy = ((50 - relY) / 45) * maxSpan;
    const lat = room.config.center.lat + dy / 111_320;
    const lng =
      room.config.center.lng +
      dx / (111_320 * Math.cos((room.config.center.lat * Math.PI) / 180));
    onMapClickCoordinate(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  };

  // Perimeter circle takes 90% width/height when radius == radiusMeters / 1.18 * 45% * 2
  const zoneDiameterPct = (1 / 1.18) * 90;

  return (
    <div
      ref={containerRef}
      data-testid="tactical-radar-map"
      onClick={handleSurfaceClick}
      className={`relative w-full h-full overflow-hidden bg-[#0b1116] select-none ${
        manualMode ? 'cursor-crosshair' : ''
      }`}
    >
      {/* Topographic grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Concentric range rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          style={{ width: `${zoneDiameterPct}%`, height: `${zoneDiameterPct}%` }}
          className="aspect-square max-h-[86%] max-w-[86%] rounded-full border-2 border-amber-500/70 bg-amber-500/[0.03] relative flex items-center justify-center"
        >
          <div className="w-[66%] h-[66%] rounded-full border border-dashed border-slate-600/50 flex items-center justify-center">
            <div className="w-[50%] h-[50%] rounded-full border border-dashed border-slate-700/50" />
          </div>
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-mono text-amber-400 tabular-nums whitespace-nowrap">
            {room.config.radiusMiles.toFixed(2)} MI PERIMETER LIMIT
          </span>
        </div>
      </div>

      {/* Center origin marker */}
      <div
        style={{ left: '50%', top: '50%' }}
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70 ring-4 ring-amber-400/15" />
      </div>

      {/* Defender Barriers */}
      {room.barriers.map((barrier) => {
        const pos = projectToPercent({ lat: barrier.lat, lng: barrier.lng });
        return (
          <div
            key={barrier.id}
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <div className="w-16 h-16 rounded-full border-2 border-orange-400 bg-orange-500/20 flex items-center justify-center">
              <span className="text-[10px] font-mono text-orange-200 font-semibold">
                BARRIER
              </span>
            </div>
          </div>
        );
      })}

      {/* Last 2-minute Radar Pings */}
      {room.players.map((p) => {
        if (!p.locationHidden || !p.lastKnownPing) return null;
        const pos = projectToPercent(p.lastKnownPing);
        return (
          <button
            key={`ping_${p.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPlayer(p.id);
            }}
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer z-10"
          >
            <span className="px-1.5 py-0.5 mb-1 text-[10px] font-mono bg-amber-950/95 text-amber-300 border border-amber-500/50 rounded whitespace-nowrap">
              2M PING · {p.name}
            </span>
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-amber-400 bg-amber-500/20 flex items-center justify-center">
              <Radio className="w-3 h-3 text-amber-300" aria-hidden="true" />
            </div>
          </button>
        );
      })}

      {/* Live Players */}
      {room.players.map((p) => {
        if (p.locationHidden || p.lat === null || p.lng === null) return null;
        const pos = projectToPercent({ lat: p.lat, lng: p.lng });
        const isSelf = p.id === selfPlayer?.id;
        const isInfectedPending = p.infectionStatus === 'infected_pending';
        const isZombie = p.team === 'zombie';
        const isSelected = p.id === selectedPlayerId;
        const distFromCenter = metersToMiles(
          haversineDistanceMeters({ lat: p.lat, lng: p.lng }, room.config.center),
        );
        const reviveRemainingSec =
          isInfectedPending && p.infectedPendingUntil
            ? Math.max(0, Math.ceil((p.infectedPendingUntil - now) / 1000))
            : 0;

        return (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPlayer(p.id);
            }}
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            aria-label={`Select player ${p.name} (${ROLES[p.role].name})`}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer z-20"
          >
            <span
              className={`px-2 py-0.5 mb-1 rounded text-[11px] font-medium whitespace-nowrap border shadow tabular-nums ${
                isInfectedPending
                  ? 'bg-amber-950/95 text-amber-200 border-amber-400'
                  : isZombie
                    ? 'bg-red-950/95 text-red-100 border-red-500/60'
                    : 'bg-emerald-950/95 text-emerald-100 border-emerald-500/60'
              } ${isSelected ? 'ring-2 ring-white' : ''}`}
            >
              {isSelf ? `YOU · ${p.name}` : p.name} ·{' '}
              {isInfectedPending
                ? `REVIVE ${formatSecondsClock(reviveRemainingSec)}`
                : `${distFromCenter.toFixed(2)}mi`}
            </span>
            <div className="relative flex items-center justify-center">
              {(p.abilityActiveUntil > now || isInfectedPending) && (
                <span
                  className={`absolute inset-0 rounded-full animate-radar-ring ${
                    isInfectedPending
                      ? 'bg-amber-400/50'
                      : isZombie
                        ? 'bg-red-500/40'
                        : 'bg-emerald-400/40'
                  }`}
                />
              )}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-lg ${
                  isInfectedPending
                    ? 'bg-amber-500 border-amber-100 text-slate-950'
                    : isZombie
                      ? 'bg-red-600 border-red-200 text-white'
                      : 'bg-emerald-600 border-emerald-200 text-white'
                } ${isSelf ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0b1116]' : ''}`}
              >
                <RoleIcon role={p.role} className="w-4 h-4" />
              </div>
            </div>
          </button>
        );
      })}

      {/* Coordinate & Mode Footnote */}
      <div className="absolute bottom-3 left-3 pointer-events-none text-[11px] font-mono text-slate-400 bg-[#0b0f12]/80 px-2.5 py-1 rounded border border-white/10 flex items-center gap-2">
        <Navigation className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
        <span>
          SECTOR {room.config.center.lat.toFixed(4)},{' '}
          {room.config.center.lng.toFixed(4)}
          {manualMode ? ' · Click map to move position' : ''}
        </span>
      </div>
    </div>
  );
}

export function TacticalMap(props: TacticalMapProps) {
  const [useFallback, setUseFallback] = useState(false);

  if (!props.mapsApiKey || useFallback) {
    return <TacticalRadarVectorFallback {...props} />;
  }

  return (
    <APIProvider apiKey={props.mapsApiKey} language="en" region="US">
      <GoogleMapInner
        {...props}
        onFallbackNeeded={() => setUseFallback(true)}
      />
    </APIProvider>
  );
}
