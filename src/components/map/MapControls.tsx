import React from 'react';
import { Layers, Minus, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapControlsProps {
  bearing: number;
  showCompass: boolean;
  isHeadingUp: boolean;
  isFitGroup: boolean;
  onCompass: () => void;
  onOpenLayers: () => void;
  onFitGroup: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const buttonBase =
  'map-fab w-11 h-11 flex items-center justify-center transition-all active:scale-90 select-none';

export const MapControls: React.FC<MapControlsProps> = ({
  bearing,
  showCompass,
  isHeadingUp,
  isFitGroup,
  onCompass,
  onOpenLayers,
  onFitGroup,
  onZoomIn,
  onZoomOut,
}) => {
  return (
    <div className="flex flex-col items-end gap-2 pointer-events-auto">
      {/* Compass: shows north; tap toggles heading-up ↔ north-up while navigating */}
      <button
        type="button"
        onClick={onCompass}
        aria-label={isHeadingUp ? 'Switch to north-up' : 'Reset to north'}
        title={isHeadingUp ? 'Heading-up — tap for north-up' : 'Reset to north'}
        className={cn(
          buttonBase,
          'rounded-full transition-[opacity,transform] duration-300',
          showCompass ? 'opacity-100' : 'opacity-0 pointer-events-none scale-75'
        )}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6" style={{ transform: `rotate(${-bearing}deg)` }} aria-hidden="true">
          <path d="M12 2.5 15.2 12H8.8Z" fill="#ef4444" />
          <path d="M12 21.5 8.8 12h6.4Z" className="fill-slate-300" />
          <circle cx="12" cy="12" r="1.6" className="fill-slate-900" />
        </svg>
      </button>

      <button type="button" onClick={onOpenLayers} aria-label="Map type and layers" title="Map type & layers" className={cn(buttonBase, 'rounded-2xl')}>
        <Layers className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={onFitGroup}
        aria-label="Show all riders"
        title="Show all riders"
        className={cn(buttonBase, 'rounded-2xl', isFitGroup && 'map-fab--active')}
      >
        <Users className="w-5 h-5" />
      </button>

      <div className="map-fab flex flex-col rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className="w-11 h-11 flex items-center justify-center active:bg-white/10 transition-colors border-b border-white/10"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className="w-11 h-11 flex items-center justify-center active:bg-white/10 transition-colors"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
