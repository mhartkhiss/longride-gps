import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { Destination } from '@/types/database';
import { RouteResult } from '@/features/routing/mapboxDirections';

interface RouteLayerProps {
  map: mapboxgl.Map | null;
  destination: Destination | null;
  route: RouteResult | null;
}

const ROUTE_SOURCE_ID = 'shared-route-source';
const ROUTE_LAYER_ID = 'shared-route-line';
const ROUTE_CASING_ID = 'shared-route-casing';

export const RouteLayer: React.FC<RouteLayerProps> = ({ map, destination, route }) => {
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // 1. Destination Marker
  useEffect(() => {
    if (!map) return;

    if (!destination) {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      return;
    }

    if (!destMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center animate-bounce';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 bg-rose-600 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-white text-base font-bold">
            🏁
          </div>
        </div>
        <div class="mt-1 px-2.5 py-1 bg-slate-900/95 text-rose-300 text-xs font-bold rounded-lg border border-rose-500/40 shadow-xl max-w-[140px] truncate text-center">
          ${destination.name || 'Destination'}
        </div>
      `;

      destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat([destination.lng, destination.lat]);
      const label = destMarkerRef.current.getElement().querySelector('div:last-child');
      if (label) label.textContent = destination.name || 'Destination';
    }
  }, [map, destination]);

  // 2. Shared Route Line (GeoJSON)
  useEffect(() => {
    if (!map) return;

    const sourceData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features: route
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: route.geometry,
            },
          ]
        : [],
    };

    const updateOrAddLayer = () => {
      try {
        if (!map || !map.getStyle()) return;
        const existingSource = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

        if (existingSource) {
          existingSource.setData(sourceData);
        } else {
          map.addSource(ROUTE_SOURCE_ID, {
            type: 'geojson',
            data: sourceData,
          });

          // Casing / Glow layer under the line
          map.addLayer({
            id: ROUTE_CASING_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#064e3b',
              'line-width': 8,
              'line-opacity': 0.8,
            },
          });

          // Main luminous route line
          map.addLayer({
            id: ROUTE_LAYER_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#10b981',
              'line-width': 5,
              'line-opacity': 0.95,
            },
          });
        }
      } catch {
        // Map style already disposed or in transition
      }
    };

    try {
      if (map.isStyleLoaded()) {
        updateOrAddLayer();
      } else {
        map.once('style.load', updateOrAddLayer);
      }
    } catch {
      // Ignore
    }
  }, [map, route]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      try {
        if (map && map.getStyle()) {
          if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
          if (map.getLayer(ROUTE_CASING_ID)) map.removeLayer(ROUTE_CASING_ID);
          if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
        }
      } catch {
        // Map instance already removed by parent component
      }
    };
  }, [map]);

  return null;
};
