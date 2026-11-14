import React, { useEffect, useState } from 'react';
import { Crosshair, Gauge, MapPin, Navigation, Radio, UserCheck, X } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { useSessionStore } from '@/stores/sessionStore';
import {
  calculateDistanceMeters,
  cn,
  formatDistance,
  formatTimeAgo,
  getRiderColor,
  haptic,
  speedToKmh,
} from '@/lib/utils';
import { formatBarangay, PlaceInfo, reverseGeocode } from '@/features/geocoding/geocoding';

interface RiderDetailCardProps {
  onFocusRider?: (lng: number, lat: number) => void;
}

const STALE_MS = 30000;

export const RiderDetailCard: React.FC<RiderDetailCardProps> = ({ onFocusRider }) => {
  const selectedUserId = useMapStore((s) => s.selectedUserId);
  const followingUserId = useMapStore((s) => s.followingUserId);
  const riderLocations = useMapStore((s) => s.riderLocations);
  const userLocation = useMapStore((s) => s.userLocation);
  const setSelectedUserId = useMapStore((s) => s.setSelectedUserId);
  const setFollowingUserId = useMapStore((s) => s.setFollowingUserId);
  const clearFollowing = useMapStore((s) => s.clearFollowing);
  const participants = useRideStore((s) => s.participants);
  const onlineUserIds = useRideStore((s) => s.onlineUserIds);
  const user = useSessionStore((s) => s.user);

  const loc = selectedUserId ? riderLocations[selectedUserId] : undefined;
  const [place, setPlace] = useState<PlaceInfo | null>(null);

  // Barangay-level "where are they" — looked up again each time they move ~100 m
  const locKey = loc ? `${loc.lng.toFixed(3)},${loc.lat.toFixed(3)}` : null;
  useEffect(() => {
    if (!selectedUserId) return;
    setPlace(null);
  }, [selectedUserId]);
  useEffect(() => {
    if (!locKey || !loc) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      reverseGeocode(loc.lng, loc.lat, controller.signal)
        .then((p) => setPlace(p))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locKey]);

  if (!selectedUserId || selectedUserId === user?.id) return null;

  const participant = participants.find((p) => p.user_id === selectedUserId);
  const isOnline = onlineUserIds.includes(selectedUserId);
  const isFollowing = followingUserId === selectedUserId;
  const isStale = !!loc && Date.now() - loc.timestamp > STALE_MS;
  const displayName = loc?.displayName || participant?.display_name || 'Rider';
  const avatarUrl = loc?.avatarUrl || participant?.avatar_url || null;
  const color = getRiderColor(selectedUserId);
  const vehicleType = loc?.vehicleType || participant?.vehicle_type || 'motorcycle';
  const distance =
    userLocation && loc ? calculateDistanceMeters(userLocation.lat, userLocation.lng, loc.lat, loc.lng) : null;
  const area = place
    ? [place.street, formatBarangay(place.barangay, place.countryCode), place.city].filter(Boolean).join(', ')
    : null;

  const handleToggleFollow = () => {
    haptic(30);
    if (isFollowing) clearFollowing();
    else setFollowingUserId(selectedUserId);
  };

  return (
    <div className="glass-panel bg-slate-900/90 p-3.5 rounded-3xl border-white/10 shadow-2xl space-y-3 pointer-events-auto w-full lr-anim-drop">
      <div className="flex items-start gap-3">
        <div
          className="relative w-12 h-12 rounded-full border-[3px] border-white/90 flex items-center justify-center text-white font-black text-lg shrink-0 overflow-hidden shadow-lg"
          style={{ backgroundColor: color }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-base font-extrabold text-white truncate">{displayName}</h4>
            {participant?.is_host && <span title="Host" className="text-sm shrink-0">👑</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
            <span className="capitalize px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold">{vehicleType}</span>
            {!isOnline ? (
              <span className="text-slate-500">Offline</span>
            ) : isStale && loc ? (
              <span className="text-amber-400 font-semibold">Signal lost · {formatTimeAgo(loc.timestamp)}</span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedUserId(null)}
          aria-label="Close"
          className="w-11 h-11 -mr-1.5 -mt-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-2xl bg-slate-950/50 border border-white/5 px-3 py-2">
        <MapPin className="w-4 h-4 text-brand-300 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-200 leading-snug min-w-0">
          {loc ? area || 'Looking up area…' : 'No location shared yet'}
          {loc && loc.accuracy > 25 && (
            <span className="text-amber-300/90"> · ±{Math.round(loc.accuracy)} m</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-950/50 border border-white/5 px-3 py-2 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-300 shrink-0" />
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Speed</p>
            <p className="text-sm font-extrabold text-white tabular-nums">{loc ? `${speedToKmh(loc.speed)} km/h` : '—'}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-950/50 border border-white/5 px-3 py-2 flex items-center gap-2">
          <Radio className="w-4 h-4 text-purple-300 shrink-0" />
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">From you</p>
            <p className="text-sm font-extrabold text-white tabular-nums">{distance !== null ? formatDistance(distance) : '—'}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggleFollow}
          disabled={!loc}
          className={cn(
            'flex-1 h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40',
            isFollowing ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-brand-500 text-slate-950 shadow-lg shadow-brand-500/20'
          )}
        >
          {isFollowing ? <UserCheck className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}
          {isFollowing ? 'Following' : 'Follow & route'}
        </button>
        {loc && (
          <button
            type="button"
            onClick={() => {
              haptic(15);
              onFocusRider?.(loc.lng, loc.lat);
            }}
            aria-label="Show on map"
            className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-white/10 text-slate-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Crosshair className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
