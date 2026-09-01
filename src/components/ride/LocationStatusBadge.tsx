import React from 'react';
import { Radio, ShieldAlert } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { formatSpeed } from '@/lib/utils';

export const LocationStatusBadge: React.FC = () => {
  const { userLocation, isSharingLocation, setSharingLocation } = useMapStore();

  const handleToggleSharing = () => {
    setSharingLocation(!isSharingLocation);
  };

  return (
    <div className="flex items-center gap-1.5 pointer-events-auto">
      <button
        onClick={handleToggleSharing}
        title={isSharingLocation ? 'Location sharing is ACTIVE' : 'Location sharing is PAUSED'}
        className={`glass-panel px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 text-xs font-semibold shadow-lg ${
          isSharingLocation
            ? 'border-brand-500/50 bg-brand-500/15 text-brand-400'
            : 'border-amber-500/50 bg-amber-500/15 text-amber-400'
        }`}
      >
        {isSharingLocation ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
            </span>
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Broadcasting</span>
          </>
        ) : (
          <>
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">GPS Paused</span>
          </>
        )}
      </button>

      {userLocation && userLocation.speed !== null && (
        <div className="glass-panel px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-200 hidden md:flex items-center gap-1.5 shadow-lg">
          <span className="text-brand-400">{formatSpeed(userLocation.speed)}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">±{Math.round(userLocation.accuracy)}m</span>
        </div>
      )}
    </div>
  );
};
