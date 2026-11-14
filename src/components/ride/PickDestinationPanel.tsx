import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { getActiveMap } from '@/features/map/liveState';
import { formatBarangay, PlaceInfo, placeLabel, reverseGeocode } from '@/features/geocoding/geocoding';
import { Destination } from '@/types/database';
import { calculateDistanceMeters, formatDistance, haptic } from '@/lib/utils';

interface PickDestinationPanelProps {
  onConfirm: (dest: Destination) => Promise<void>;
}

/** Bottom card shown while the host moves the map under the crosshair pin. */
export const PickDestinationPanel: React.FC<PickDestinationPanelProps> = ({ onConfirm }) => {
  const setPickState = useMapStore((s) => s.setPickState);
  const setUiInsets = useMapStore((s) => s.setUiInsets);
  const userLocation = useMapStore((s) => s.userLocation);
  const panelRef = useRef<HTMLDivElement>(null);

  const [point, setPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const report = () => setUiInsets({ bottom: Math.round(el.getBoundingClientRect().height) + 8 });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setUiInsets]);

  // Track the point under the crosshair; look up its name once the map settles
  useEffect(() => {
    const map = getActiveMap();
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const pointUnderPin = () => {
      const { top, bottom } = useMapStore.getState().uiInsets;
      const canvas = map.getCanvas();
      const x = canvas.clientWidth / 2;
      const y = top + Math.max(0, canvas.clientHeight - top - bottom) / 2;
      const ll = map.unproject([x, y]);
      return { lng: ll.lng, lat: ll.lat };
    };

    const onMove = () => setPoint(pointUnderPin());
    const onMoveEnd = () => {
      const p = pointUnderPin();
      setPoint(p);
      if (timer) clearTimeout(timer);
      controller?.abort();
      setIsLooking(true);
      timer = setTimeout(() => {
        controller = new AbortController();
        reverseGeocode(p.lng, p.lat, controller.signal)
          .then((info) => setPlace(info))
          .catch(() => {})
          .finally(() => setIsLooking(false));
      }, 300);
    };

    onMoveEnd();
    map.on('move', onMove);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  const distance =
    point && userLocation ? calculateDistanceMeters(userLocation.lat, userLocation.lng, point.lat, point.lng) : null;
  const area = place ? [formatBarangay(place.barangay, place.countryCode), place.city].filter(Boolean).join(', ') : null;

  const handleConfirm = async () => {
    if (!point || isSaving) return;
    setIsSaving(true);
    try {
      haptic([30, 40, 30]);
      await onConfirm({ name: placeLabel(place), lng: point.lng, lat: point.lat });
      setPickState(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto glass-panel bg-slate-900/95 border-white/10 rounded-t-[28px] sm:rounded-3xl shadow-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] space-y-3 lr-anim-sheet"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
          <Flag className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Move the map to place the pin</p>
          <p className="text-base font-extrabold text-white truncate flex items-center gap-2">
            {isLooking && !place ? 'Finding place…' : placeLabel(place)}
            {isLooking && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {[area, distance !== null ? `${formatDistance(distance)} from you` : null].filter(Boolean).join(' · ') ||
              (point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : '')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickState(null)}
          aria-label="Cancel"
          className="w-11 h-11 -mr-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPickState(null)}
          className="h-12 px-5 rounded-2xl bg-slate-800/90 border border-white/10 text-sm font-bold text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!point || isSaving}
          className="flex-1 h-12 rounded-2xl bg-brand-500 text-slate-950 text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
          Set as destination
        </button>
      </div>
    </div>
  );
};
