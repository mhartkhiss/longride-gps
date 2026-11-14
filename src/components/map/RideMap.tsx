import React, { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { AlertCircle } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { useSessionStore } from '@/stores/sessionStore';
import { DEFAULT_MAP_CENTER } from '@/lib/mapbox';
import { hasValidMapboxConfig } from '@/lib/env';
import { haptic } from '@/lib/utils';
import { addFrameTask } from '@/features/map/frameLoop';
import { getActiveMap, liveTracks, setActiveMap } from '@/features/map/liveState';
import { NavigationCamera } from '@/features/map/navigationCamera';
import { BASEMAP_IMPORT_ID, basemapConfig, buildImport, buildRootStyle, resolveLightPreset } from '@/features/map/mapStyle';
import { applyOverlayTheme, ensureCustomLayers, LAYER, setLayerVisible } from '@/features/map/layers';
import type { LightPreset } from '@/lib/sun';
import { MapControls } from './MapControls';
import { RiderMarkerLayer } from './RiderMarkerLayer';
import { RouteLayer } from './RouteLayer';
import { FollowRouteLayer } from './FollowRouteLayer';
import { TrailsLayer } from './TrailsLayer';
import { LocateButton } from './LocateButton';
import { SpeedBubble } from './SpeedBubble';
import { MapLayersSheet } from './MapLayersSheet';

interface RideMapProps {
  /** Hosts can long-press the map to drop a destination pin. */
  canPickDestination?: boolean;
}

const AUTO_RECENTER_IDLE_MS = 10000;
const AUTO_RECENTER_MIN_SPEED = 2.5; // m/s ≈ 9 km/h
const LONG_PRESS_MS = 550;

export const RideMap: React.FC<RideMapProps> = ({ canPickDestination = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cameraRef = useRef<NavigationCamera | null>(null);
  const presetRef = useRef<LightPreset>('night');
  const lastInteractionRef = useRef(0);
  const canPickRef = useRef(canPickDestination);
  canPickRef.current = canPickDestination;

  const [mapLoaded, setMapLoaded] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [isLayersOpen, setIsLayersOpen] = useState(false);

  const userLocation = useMapStore((s) => s.userLocation);
  const riderLocations = useMapStore((s) => s.riderLocations);
  const cameraMode = useMapStore((s) => s.cameraMode);
  const followingUserId = useMapStore((s) => s.followingUserId);
  const settings = useMapStore((s) => s.settings);
  const uiInsets = useMapStore((s) => s.uiInsets);
  const pickState = useMapStore((s) => s.pickState);
  const setCameraMode = useMapStore((s) => s.setCameraMode);
  const setSelectedUserId = useMapStore((s) => s.setSelectedUserId);

  const currentRide = useRideStore((s) => s.currentRide);
  const participants = useRideStore((s) => s.participants);
  const destination = useRideStore((s) => s.destination);
  const route = useRideStore((s) => s.route);
  const routeProgress = useRideStore((s) => s.routeProgress);
  const user = useSessionStore((s) => s.user);

  const isFollowing = cameraMode === 'FOLLOW_ME' || cameraMode === 'FOLLOW_RIDER';

  // 1. Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const { settings: initialSettings, userLocation: initialLocation } = useMapStore.getState();
    const preset = resolveLightPreset(initialSettings.theme, initialLocation?.lat ?? null, initialLocation?.lng ?? null);
    presetRef.current = preset;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: buildRootStyle(initialSettings.mapType, preset, initialSettings.tilt3D),
      center: initialLocation ? [initialLocation.lng, initialLocation.lat] : DEFAULT_MAP_CENTER,
      zoom: initialLocation ? 16.5 : 13,
      pitch: 0,
      maxPitch: 70,
      attributionControl: false,
      logoPosition: 'bottom-left',
      fadeDuration: 150,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    const camera = new NavigationCamera(map);
    cameraRef.current = camera;
    mapRef.current = map;
    setActiveMap(map);

    map.on('style.load', () => {
      try {
        ensureCustomLayers(map);
        const s = useMapStore.getState().settings;
        applyOverlayTheme(map, s.mapType, presetRef.current);
        setLayerVisible(map, [LAYER.tracks, LAYER.paths], s.showPathways);
        setLayerVisible(map, [LAYER.trails], s.showTrails);
      } catch (err) {
        console.warn('Failed to add custom map layers:', err);
      }
    });
    map.on('load', () => setMapLoaded(true));
    map.on('rotate', () => setBearing(map.getBearing()));

    // ── Gestures: drag / rotate / tilt hand the camera back to the rider ──
    // Camera moves we make ourselves carry no DOM event; user gestures do.
    const isUserEvent = (e: unknown) => !!(e as { originalEvent?: Event }).originalEvent;
    const markInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    const releaseCamera = (e: unknown) => {
      if (!isUserEvent(e)) return;
      markInteraction();
      const mode = useMapStore.getState().cameraMode;
      if (mode !== 'FREE') useMapStore.getState().setCameraMode('FREE');
    };
    map.on('dragstart', releaseCamera);
    map.on('rotatestart', releaseCamera);
    map.on('pitchstart', releaseCamera);
    // Pinch / wheel zoom keeps following — it just changes how close the camera sits
    map.on('zoomstart', (e) => {
      if (!isUserEvent(e)) return;
      markInteraction();
      camera.setUserZooming(true);
    });
    map.on('zoomend', (e) => {
      if (!isUserEvent(e)) return;
      camera.setUserZooming(false);
    });

    // ── Long-press (touch) / right-click to drop a destination pin ──
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressStart: mapboxgl.Point | null = null;
    let lastPickAt = 0;
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pressStart = null;
    };
    const startPick = (lngLat: mapboxgl.LngLat) => {
      if (!canPickRef.current || Date.now() - lastPickAt < 800) return;
      lastPickAt = Date.now();
      haptic(40);
      useMapStore.getState().setPickState({ start: [lngLat.lng, lngLat.lat] });
    };
    map.on('touchstart', (e) => {
      cancelPress();
      if (e.originalEvent.touches.length !== 1) return;
      pressStart = e.point;
      const lngLat = e.lngLat;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        startPick(lngLat);
      }, LONG_PRESS_MS);
    });
    map.on('touchmove', (e) => {
      if (pressStart && e.point.dist(pressStart) > 12) cancelPress();
    });
    map.on('touchend', cancelPress);
    map.on('touchcancel', cancelPress);
    map.on('contextmenu', (e) => startPick(e.lngLat));

    // Double tap while following zooms the navigation camera instead of fighting it
    map.on('dblclick', (e) => {
      const mode = useMapStore.getState().cameraMode;
      if (mode === 'FOLLOW_ME' || mode === 'FOLLOW_RIDER') {
        e.preventDefault();
        camera.nudgeZoom(1);
      }
    });

    const removeCameraTask = addFrameTask(10, (now, dt) => camera.frame(now, dt));

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelPress();
      removeCameraTask();
      resizeObserver.disconnect();
      if (getActiveMap() === map) setActiveMap(null);
      cameraRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Map type / theme / 3D buildings
  const lat = userLocation?.lat ?? null;
  const lng = userLocation?.lng ?? null;
  const hasLocation = lat !== null;
  const mapTypeRef = useRef(settings.mapType);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const apply = () => {
      const { lat: curLat, lng: curLng } = useMapStore.getState().userLocation ?? { lat: null, lng: null };
      const preset = resolveLightPreset(settings.theme, curLat, curLng);
      try {
        if (mapTypeRef.current !== settings.mapType) {
          mapTypeRef.current = settings.mapType;
          presetRef.current = preset;
          map.updateImport(BASEMAP_IMPORT_ID, buildImport(settings.mapType, preset, settings.tilt3D));
        } else {
          const config = basemapConfig(settings.mapType, preset, settings.tilt3D);
          if (preset !== presetRef.current) {
            presetRef.current = preset;
            map.setConfigProperty(BASEMAP_IMPORT_ID, 'lightPreset', preset);
          }
          if (settings.mapType === 'standard') {
            map.setConfigProperty(BASEMAP_IMPORT_ID, 'show3dObjects', config.show3dObjects);
          }
        }
        applyOverlayTheme(map, settings.mapType, presetRef.current);
      } catch (err) {
        console.warn('Failed to update map style:', err);
      }
    };

    apply();
    // Auto theme follows the sun: re-check every minute
    const timer = settings.theme === 'auto' ? setInterval(apply, 60000) : null;
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [mapLoaded, settings.mapType, settings.theme, settings.tilt3D, hasLocation]);

  // 3. Overlay visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    setLayerVisible(map, [LAYER.tracks, LAYER.paths], settings.showPathways);
    setLayerVisible(map, [LAYER.trails], settings.showTrails);
  }, [mapLoaded, settings.showPathways, settings.showTrails]);

  // 4. While following, zoom gestures pivot around the puck and double-tap feeds the camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const around = isFollowing ? { around: 'center' as const } : undefined;
    map.touchZoomRotate.enable(around);
    map.scrollZoom.enable(around);
    if (isFollowing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [isFollowing]);

  // 5. Auto re-center (like Waze / Google Maps) once the rider is moving and stops touching the map
  useEffect(() => {
    const timer = setInterval(() => {
      const state = useMapStore.getState();
      if (state.cameraMode !== 'FREE' && state.cameraMode !== 'FIT_GROUP') return;
      if (state.selectedUserId || state.pickState) return;
      if (Date.now() - lastInteractionRef.current < AUTO_RECENTER_IDLE_MS) return;
      if ((liveTracks.self.speed ?? 0) < AUTO_RECENTER_MIN_SPEED || !liveTracks.self.initialized) return;
      state.setCameraMode(state.followingUserId ? 'FOLLOW_RIDER' : 'FOLLOW_ME');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 6. First fix: jump to the rider instead of the default city view
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    if (centeredOnceRef.current || lat === null || lng === null) return;
    centeredOnceRef.current = true;
    if (useMapStore.getState().cameraMode !== 'FOLLOW_ME') {
      mapRef.current?.jumpTo({ center: [lng, lat], zoom: 16.5 });
    }
  }, [lat, lng]);

  // 7. Pick-destination mode: hand the camera to the rider and fly to the pressed point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickState) return;
    setCameraMode('FREE');
    lastInteractionRef.current = Date.now();
    const { top, bottom } = useMapStore.getState().uiInsets;
    const start = pickState.start;
    map.easeTo({
      center: start ?? map.getCenter(),
      zoom: Math.max(map.getZoom(), 16.5),
      pitch: 0,
      padding: { top, bottom, left: 0, right: 0 },
      retainPadding: false,
      duration: 600,
    });
  }, [pickState, setCameraMode]);

  // ── Control handlers ──
  const handleFitGroup = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds();
    let points = 0;
    if (liveTracks.self.initialized) {
      bounds.extend([liveTracks.self.lng, liveTracks.self.lat]);
      points++;
    }
    liveTracks.riders.forEach((t) => {
      if (!t.initialized) return;
      bounds.extend([t.lng, t.lat]);
      points++;
    });
    if (destination) {
      bounds.extend([destination.lng, destination.lat]);
      points++;
    }
    if (!points) return;

    haptic(25);
    lastInteractionRef.current = Date.now();
    setCameraMode('FIT_GROUP');
    const { top, bottom } = useMapStore.getState().uiInsets;
    map.fitBounds(bounds, {
      padding: { top: top + 48, bottom: bottom + 48, left: 48, right: 72 },
      maxZoom: 17,
      bearing: 0,
      pitch: 0,
      duration: 1000,
      retainPadding: false,
    } as mapboxgl.FitBoundsOptions);
  }, [destination, setCameraMode]);

  const handleZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    haptic(15);
    const mode = useMapStore.getState().cameraMode;
    if (mode === 'FOLLOW_ME' || mode === 'FOLLOW_RIDER') cameraRef.current?.nudgeZoom(delta);
    else map.easeTo({ zoom: map.getZoom() + delta, duration: 250 });
  }, []);

  const handleCompass = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    haptic(20);
    const state = useMapStore.getState();
    if (state.cameraMode === 'FOLLOW_ME') {
      state.updateSettings({ headingUp: !state.settings.headingUp });
    } else {
      lastInteractionRef.current = Date.now();
      map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    }
  }, []);

  const showRotationHint = Math.abs(bearing) > 1.5 || (cameraMode === 'FOLLOW_ME' && settings.headingUp);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-slate-950"
      style={{ ['--lr-map-bottom' as string]: `${uiInsets.bottom}px` }}
    >
      <div ref={containerRef} className="lr-map w-full h-full" />

      {!hasValidMapboxConfig && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 glass-panel border-amber-500/40 px-4 py-2 rounded-xl flex items-center gap-2 text-amber-300 text-xs shadow-2xl max-w-sm text-center">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Add your <strong>VITE_MAPBOX_ACCESS_TOKEN</strong> in <code>.env.local</code> to enable the map.
          </span>
        </div>
      )}

      {/* Right-hand control stack */}
      <div
        className="absolute right-3 z-20 pr-[env(safe-area-inset-right,0px)] transition-[top] duration-300"
        style={{ top: uiInsets.top + 12 }}
      >
        <MapControls
          bearing={bearing}
          showCompass={showRotationHint}
          isHeadingUp={cameraMode === 'FOLLOW_ME' && settings.headingUp}
          isFitGroup={cameraMode === 'FIT_GROUP'}
          onCompass={handleCompass}
          onOpenLayers={() => setIsLayersOpen(true)}
          onFitGroup={handleFitGroup}
          onZoomIn={() => handleZoom(1)}
          onZoomOut={() => handleZoom(-1)}
        />
      </div>

      {/* Bottom corners: live speed + locate / re-center */}
      {!pickState && (
        <>
          <div
            className="absolute left-3 z-20 pl-[env(safe-area-inset-left,0px)] transition-[bottom] duration-300"
            style={{ bottom: uiInsets.bottom + 34 }}
          >
            <SpeedBubble />
          </div>
          <div
            className="absolute right-3 z-20 pr-[env(safe-area-inset-right,0px)] transition-[bottom] duration-300"
            style={{ bottom: uiInsets.bottom + 34 }}
          >
            <LocateButton />
          </div>
        </>
      )}

      {/* Crosshair while picking a destination */}
      {pickState && (
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -translate-y-full"
          style={{ top: `calc(${uiInsets.top}px + (100% - ${uiInsets.top + uiInsets.bottom}px) / 2)` }}
        >
          <div className="lr-pick-pin">
            <span className="lr-pick-pin__head" />
            <span className="lr-pick-pin__stem" />
          </div>
        </div>
      )}

      {mapLoaded && (
        <>
          <TrailsLayer map={mapRef.current} currentUserId={user?.id || ''} />
          <RouteLayer map={mapRef.current} route={route} progressFraction={routeProgress?.fraction ?? 0} />
          <FollowRouteLayer
            map={mapRef.current}
            userLocation={userLocation}
            followingUserId={followingUserId}
            riderLocations={riderLocations}
            vehicleMode={currentRide?.vehicle_mode}
          />
          <RiderMarkerLayer
            map={mapRef.current}
            currentUserLocation={userLocation}
            currentUserId={user?.id || ''}
            riderLocations={riderLocations}
            participants={participants}
            followingUserId={followingUserId}
            onSelectRider={(id) => {
              if (useMapStore.getState().pickState) return;
              setSelectedUserId(id);
            }}
          />
        </>
      )}

      <MapLayersSheet isOpen={isLayersOpen} onClose={() => setIsLayersOpen(false)} />
    </div>
  );
};
