import React from 'react';
import { Crosshair, Users, Layers, Plus, Minus, Compass } from 'lucide-react';
import { CameraMode } from '@/stores/mapStore';

interface MapControlsProps {
  cameraMode: CameraMode;
  onRecenter: () => void;
  onFitGroup: () => void;
  onTogglePitch: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  is3D: boolean;
  bearing: number;
  onResetNorth: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  cameraMode,
  onRecenter,
  onFitGroup,
  onTogglePitch,
  onZoomIn,
  onZoomOut,
  is3D,
  bearing,
  onResetNorth,
}) => {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2 pointer-events-auto">
      {/* Compass / Reset North */}
      {Math.abs(bearing) > 2 && (
        <button
          onClick={onResetNorth}
          title="Reset North"
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl glass-panel flex items-center justify-center text-slate-200 hover:text-white hover:border-brand-500/50 transition-all active:scale-95 shadow-xl"
        >
          <Compass
            className="w-4 h-4 sm:w-5 sm:h-5 text-brand-400 transition-transform duration-200"
            style={{ transform: `rotate(${-bearing}deg)` }}
          />
        </button>
      )}

      {/* Recenter Follow Me */}
      <button
        onClick={onRecenter}
        title="Follow My Location"
        className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl glass-panel flex items-center justify-center transition-all active:scale-95 shadow-xl ${
          cameraMode === 'FOLLOW_ME'
            ? 'border-brand-500 bg-brand-500/20 text-brand-400'
            : 'text-slate-200 hover:text-white hover:border-slate-600'
        }`}
      >
        <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Fit Group */}
      <button
        onClick={onFitGroup}
        title="Fit All Riders"
        className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl glass-panel flex items-center justify-center transition-all active:scale-95 shadow-xl ${
          cameraMode === 'FIT_GROUP'
            ? 'border-brand-500 bg-brand-500/20 text-brand-400'
            : 'text-slate-200 hover:text-white hover:border-slate-600'
        }`}
      >
        <Users className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* 2D / 3D Perspective Toggle */}
      <button
        onClick={onTogglePitch}
        title="Toggle 3D View"
        className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl glass-panel flex items-center justify-center transition-all active:scale-95 shadow-xl ${
          is3D
            ? 'border-brand-500 bg-brand-500/20 text-brand-400 font-bold text-xs'
            : 'text-slate-200 hover:text-white hover:border-slate-600 font-medium text-xs'
        }`}
      >
        <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Zoom In/Out */}
      <div className="flex flex-col rounded-xl sm:rounded-2xl glass-panel overflow-hidden border border-white/10 shadow-xl">
        <button
          onClick={onZoomIn}
          title="Zoom In"
          className="w-9 h-8 sm:w-11 sm:h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/60 active:bg-slate-700/60 transition-colors border-b border-slate-700/40"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <button
          onClick={onZoomOut}
          title="Zoom Out"
          className="w-9 h-8 sm:w-11 sm:h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/60 active:bg-slate-700/60 transition-colors"
        >
          <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
};
