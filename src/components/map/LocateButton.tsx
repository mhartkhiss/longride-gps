import React from 'react';
import { LocateFixed, Navigation2, Loader2 } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { cn, haptic } from '@/lib/utils';

/**
 * Google-Maps-style location button:
 * - not following → "Re-center" pill that snaps the camera back to you
 * - following      → tap toggles heading-up (navigation) ↔ north-up
 */
export const LocateButton: React.FC = () => {
  const cameraMode = useMapStore((s) => s.cameraMode);
  const hasLocation = useMapStore((s) => s.userLocation !== null);
  const headingUp = useMapStore((s) => s.settings.headingUp);
  const setCameraMode = useMapStore((s) => s.setCameraMode);
  const updateSettings = useMapStore((s) => s.updateSettings);

  const isFollowingMe = cameraMode === 'FOLLOW_ME';

  const handleClick = () => {
    if (!hasLocation) return;
    haptic(30);
    if (isFollowingMe) {
      updateSettings({ headingUp: !headingUp });
    } else {
      setCameraMode('FOLLOW_ME');
    }
  };

  if (!hasLocation) {
    return (
      <div className="map-fab h-12 px-4 rounded-full flex items-center gap-2 text-xs font-semibold text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
        <span>Finding GPS…</span>
      </div>
    );
  }

  if (!isFollowingMe) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="map-fab h-12 pl-4 pr-5 rounded-full flex items-center gap-2 text-sm font-bold text-sky-300 active:scale-95 transition-transform lr-anim-pop"
      >
        <LocateFixed className="w-5 h-5" />
        <span>Re-center</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={headingUp ? 'Switch to north-up' : 'Switch to heading-up navigation'}
      title={headingUp ? 'Navigation view (heading-up)' : 'North-up view'}
      className={cn(
        'map-fab w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform',
        headingUp ? 'text-sky-300' : 'text-slate-200'
      )}
    >
      {headingUp ? <Navigation2 className="w-5 h-5 fill-current" /> : <LocateFixed className="w-5 h-5 text-sky-300" />}
    </button>
  );
};
