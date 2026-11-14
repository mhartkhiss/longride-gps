import { useEffect } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { trailStore } from '@/features/location/trailStore';
import { SOURCE, setSourceData } from '@/features/map/layers';
import { getRiderColor } from '@/lib/utils';

interface TrailsLayerProps {
  map: MapboxMap | null;
  currentUserId: string;
}

const SELF_TRAIL_COLOR = '#3b82f6';
const REDRAW_INTERVAL_MS = 1000;

/** Renders every rider's breadcrumb trail; redraws at most once a second. */
export const TrailsLayer: React.FC<TrailsLayerProps> = ({ map, currentUserId }) => {
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastDraw = 0;

    const draw = () => {
      timer = null;
      lastDraw = Date.now();
      const features: GeoJSON.Feature<GeoJSON.MultiLineString>[] = [];
      trailStore.get().forEach((segments, userId) => {
        const lines = segments.filter((s) => s.length > 1);
        if (!lines.length) return;
        const isSelf = userId === currentUserId;
        features.push({
          type: 'Feature',
          properties: {
            color: isSelf ? SELF_TRAIL_COLOR : getRiderColor(userId),
            opacity: isSelf ? 0.55 : 0.45,
          },
          geometry: { type: 'MultiLineString', coordinates: lines },
        });
      });
      try {
        setSourceData(map, SOURCE.trails, { type: 'FeatureCollection', features });
      } catch {
        // Style reloading
      }
    };

    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, REDRAW_INTERVAL_MS - (Date.now() - lastDraw));
      timer = setTimeout(draw, wait);
    };

    draw();
    const unsubscribe = trailStore.subscribe(schedule);
    map.on('style.load', draw);
    return () => {
      unsubscribe();
      map.off('style.load', draw);
      if (timer) clearTimeout(timer);
    };
  }, [map, currentUserId]);

  return null;
};
