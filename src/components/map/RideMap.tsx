import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { useSessionStore } from '@/stores/sessionStore';
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM, MAP_STYLES } from '@/lib/mapbox';
import { MapControls } from './MapControls';
import { RiderMarkerLayer } from './RiderMarkerLayer';
import { RouteLayer } from './RouteLayer';
import { FollowRouteLayer } from './FollowRouteLayer';
import { hasValidMapboxConfig } from '@/lib/env';
import { AlertCircle } from 'lucide-react';

export const RideMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [bearing, setBearing] = useState(0);

  const {
    userLocation,
    riderLocations,
    cameraMode,
    mapPitch,
    followingUserId,
    setCameraMode,
    setMapPitch,
    setSelectedUserId,
  } = useMapStore();

  const { currentRide, participants, destination, route } = useRideStore();
  const { user, displayName } = useSessionStore();

  // 1. Initialize Mapbox Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = userLocation
      ? [userLocation.lng, userLocation.lat] as [number, number]
      : DEFAULT_MAP_CENTER;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.dark,
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      pitch: mapPitch,
      attributionControl: true,
    });

    map.on('load', () => {
      setMapLoaded(true);
    });

    map.on('rotate', () => {
      setBearing(map.getBearing());
    });

    // Detect user manual drag/zoom to switch camera to FREE mode
    map.on('dragstart', () => {
      setCameraMode('FREE');
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Camera Following Logic
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (cameraMode === 'FOLLOW_ME' && userLocation) {
      map.easeTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 800,
      });
    } else if (cameraMode === 'FOLLOW_RIDER' && followingUserId) {
      const targetLoc = riderLocations[followingUserId];
      if (targetLoc) {
        map.easeTo({
          center: [targetLoc.lng, targetLoc.lat],
          zoom: Math.max(map.getZoom(), 15),
          duration: 800,
        });
      }
    }
  }, [userLocation, riderLocations, cameraMode, followingUserId, mapLoaded]);

  // 3. Fit Group Action
  const handleFitGroup = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    // Include user position
    if (userLocation) {
      bounds.extend([userLocation.lng, userLocation.lat]);
      hasPoints = true;
    }

    // Include other riders
    Object.values(riderLocations).forEach((loc) => {
      bounds.extend([loc.lng, loc.lat]);
      hasPoints = true;
    });

    // Include destination
    if (destination) {
      bounds.extend([destination.lng, destination.lat]);
      hasPoints = true;
    }

    if (hasPoints) {
      setCameraMode('FIT_GROUP');
      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 180, left: 60, right: 60 },
        maxZoom: 16,
        duration: 1200,
      });
    }
  }, [userLocation, riderLocations, destination, setCameraMode]);

  // Recenter on current user
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    setCameraMode('FOLLOW_ME');
    map.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 16,
      pitch: mapPitch,
      duration: 1000,
    });
  }, [userLocation, mapPitch, setCameraMode]);

  // Toggle 3D pitch
  const handleTogglePitch = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newPitch = mapPitch === 0 ? 55 : 0;
    setMapPitch(newPitch);
    map.easeTo({ pitch: newPitch, duration: 600 });
  }, [mapPitch, setMapPitch]);

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });
  const handleResetNorth = () => mapRef.current?.resetNorth({ duration: 500 });

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Mapbox Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Warning banner if Mapbox token is not configured */}
      {!hasValidMapboxConfig && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 glass-panel border-amber-500/40 px-4 py-2 rounded-xl flex items-center gap-2 text-amber-300 text-xs shadow-2xl max-w-sm text-center">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Add your <strong>VITE_MAPBOX_ACCESS_TOKEN</strong> in <code>.env.local</code> to enable high-res vector tiles & routing.</span>
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute top-16 sm:top-20 right-2.5 sm:right-4 z-20">
        <MapControls
          cameraMode={cameraMode}
          onRecenter={handleRecenter}
          onFitGroup={handleFitGroup}
          onTogglePitch={handleTogglePitch}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          is3D={mapPitch > 0}
          bearing={bearing}
          onResetNorth={handleResetNorth}
        />
      </div>

      {/* Markers and Route Layers */}
      {mapLoaded && (
        <>
          <RiderMarkerLayer
            map={mapRef.current}
            currentUserLocation={userLocation}
            currentUserId={user?.id || ''}
            currentDisplayName={displayName}
            riderLocations={riderLocations}
            participants={participants}
            followingUserId={followingUserId}
            onSelectRider={(id) => {
              setSelectedUserId(id);
            }}
          />
          <RouteLayer
            map={mapRef.current}
            destination={destination}
            route={route}
          />
          <FollowRouteLayer
            map={mapRef.current}
            userLocation={userLocation}
            followingUserId={followingUserId}
            riderLocations={riderLocations}
            vehicleMode={currentRide?.vehicle_mode}
          />
        </>
      )}
    </div>
  );
};
