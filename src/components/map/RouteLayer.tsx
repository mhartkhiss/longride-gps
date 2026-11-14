import { useEffect } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { RouteResult } from '@/features/routing/mapboxDirections';
import { SOURCE, setRouteProgress, setSourceData } from '@/features/map/layers';
import { distanceMeters } from '@/lib/geo';

interface RouteLayerProps {
  map: MapboxMap | null;
  route: RouteResult | null;
  /** 0..1 of the route already ridden — that part is trimmed off the line. */
  progressFraction: number;
}

/** Shows a dotted "last stretch" when the road network ends short of the pin. */
const CONNECTOR_MIN_METERS = 12;

export const RouteLayer: React.FC<RouteLayerProps> = ({ map, route, progressFraction }) => {
  useEffect(() => {
    if (!map) return;

    const draw = () => {
      try {
        setSourceData(map, SOURCE.route, {
          type: 'FeatureCollection',
          features: route ? [{ type: 'Feature', properties: {}, geometry: route.geometry }] : [],
        });

        const extras: GeoJSON.Feature[] = [];
        if (route) {
          const [endLng, endLat] = route.routeEnd;
          const [destLng, destLat] = route.destination;
          if (distanceMeters(endLat, endLng, destLat, destLng) > CONNECTOR_MIN_METERS) {
            extras.push({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [route.routeEnd, route.destination] },
            });
          }
          extras.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: route.destination } });
        }
        setSourceData(map, SOURCE.routeExtras, { type: 'FeatureCollection', features: extras });
      } catch {
        // Style reloading
      }
    };

    draw();
    map.on('style.load', draw);
    return () => {
      map.off('style.load', draw);
    };
  }, [map, route]);

  useEffect(() => {
    if (!map) return;
    try {
      setRouteProgress(map, route ? progressFraction : 0);
    } catch {
      // Style reloading
    }
  }, [map, route, progressFraction]);

  // Clear on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        setSourceData(map, SOURCE.route, { type: 'FeatureCollection', features: [] });
        setSourceData(map, SOURCE.routeExtras, { type: 'FeatureCollection', features: [] });
      } catch {
        // Map already removed
      }
    };
  }, [map]);

  return null;
};
