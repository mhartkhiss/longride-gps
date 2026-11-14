import React from 'react';
import { useMapStore } from '@/stores/mapStore';
import { cn, speedToKmh } from '@/lib/utils';

/** Live speedometer in the corner of the map, like Google Maps navigation. */
export const SpeedBubble: React.FC = () => {
  const speed = useMapStore((s) => s.userLocation?.speed ?? null);
  const accuracy = useMapStore((s) => s.userLocation?.accuracy ?? null);
  const hasLocation = useMapStore((s) => s.userLocation !== null);

  if (!hasLocation) return null;
  const kmh = speedToKmh(speed);
  const weakSignal = accuracy !== null && accuracy > 40;

  return (
    <div
      className={cn(
        'map-fab w-[60px] h-[60px] rounded-full flex flex-col items-center justify-center leading-none select-none',
        weakSignal && 'ring-2 ring-amber-400/60'
      )}
      title={accuracy !== null ? `GPS accuracy ±${Math.round(accuracy)} m` : undefined}
    >
      <span className="text-[22px] font-black tabular-nums text-white">{kmh}</span>
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">km/h</span>
    </div>
  );
};
