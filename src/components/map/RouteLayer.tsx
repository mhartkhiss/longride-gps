import { useEffect } from 'react';
import type { Map, GeoJSONSource } from 'mapbox-gl';
import { RouteResult } from '@/features/routing/mapboxDirections';

interface RouteLayerProps {
  map: Map | null;
  destination?: unknown;
  route: RouteResult | null;
}

const ROUTE_SOURCE_ID = 'shared-route-source';
const ROUTE_LAYER_ID = 'shared-route-line';
const ROUTE_CASING_ID = 'shared-route-casing';

export const RouteLayer: React.FC<RouteLayerProps> = ({ map, route }) => {
  // Shared Route Line (GeoJSON)
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
        const existingSource = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;

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
