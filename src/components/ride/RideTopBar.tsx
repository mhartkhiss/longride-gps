import React from 'react';
import { CirclePause, Footprints, MapPin, MessageSquare, Mountain, Radio } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { usePlaceStore } from '@/features/geocoding/placeTracking';
import { formatBarangay } from '@/features/geocoding/geocoding';
import { cn, haptic } from '@/lib/utils';

interface RideTopBarProps {
  unreadCount: number;
  onOpenChat: () => void;
}

/** GTA-style location readout: the road or path you're on, then barangay · city. */
const PlaceChip: React.FC = () => {
  const road = usePlaceStore((s) => s.road);
  const place = usePlaceStore((s) => s.place);
  const hasLocation = useMapStore((s) => s.userLocation !== null);
  const accuracy = useMapStore((s) => s.userLocation?.accuracy ?? null);

  const area = place
    ? [formatBarangay(place.barangay, place.countryCode), place.city].filter(Boolean).join(', ')
    : null;
  const title = road?.label || place?.title || (hasLocation ? 'Locating road…' : 'Finding your location…');
  const Icon = road?.offRoad ? Mountain : road && !road.named ? Footprints : MapPin;

  return (
    <div className="min-w-0 flex-1 glass-panel rounded-2xl h-12 pl-2.5 pr-3 flex items-center gap-2.5 pointer-events-auto">
      <span
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
          road?.offRoad ? 'bg-amber-500/20 text-amber-300' : 'bg-brand-500/15 text-brand-300'
        )}
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm font-bold text-white truncate">{title}</p>
        <p key={area || 'none'} className="text-[11px] text-slate-400 truncate lr-anim-fade">
          {area ||
            (accuracy !== null ? `GPS ±${Math.round(accuracy)} m` : 'Allow location access to start')}
        </p>
      </div>
      {accuracy !== null && accuracy > 40 && (
        <span className="shrink-0 rounded-full bg-amber-500/15 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
          ±{Math.round(accuracy)}m
        </span>
      )}
    </div>
  );
};

export const RideTopBar: React.FC<RideTopBarProps> = ({ unreadCount, onOpenChat }) => {
  const isSharing = useMapStore((s) => s.isSharingLocation);
  const setSharing = useMapStore((s) => s.setSharingLocation);
  const realtimeStatus = useRideStore((s) => s.realtimeStatus);

  const statusDot =
    realtimeStatus === 'CONNECTED' ? 'bg-emerald-400' : realtimeStatus === 'ERROR' ? 'bg-rose-500' : 'bg-amber-400';

  return (
    <div className="flex items-center gap-2 pointer-events-none">
      <button
        type="button"
        onClick={onOpenChat}
        aria-label={unreadCount ? `Group chat, ${unreadCount} unread` : 'Group chat'}
        className="map-fab relative w-12 h-12 rounded-2xl flex items-center justify-center pointer-events-auto active:scale-90 transition-transform shrink-0"
      >
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-600 text-white font-black text-[10px] rounded-full flex items-center justify-center border-2 border-slate-950 lr-anim-pop">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <PlaceChip />

      <button
        type="button"
        onClick={() => {
          haptic(30);
          setSharing(!isSharing);
        }}
        aria-pressed={isSharing}
        aria-label={isSharing ? 'Sharing your location — tap to pause' : 'Location sharing paused — tap to resume'}
        title={isSharing ? 'Sharing live location' : 'Location sharing paused'}
        className={cn(
          'map-fab relative w-12 h-12 rounded-2xl flex items-center justify-center pointer-events-auto active:scale-90 transition-transform shrink-0',
          isSharing ? 'text-brand-300' : 'text-amber-300 border-amber-400/50'
        )}
      >
        {isSharing ? <Radio className="w-5 h-5" /> : <CirclePause className="w-5 h-5" />}
        <span className={cn('absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-slate-900', statusDot)} />
      </button>
    </div>
  );
};
