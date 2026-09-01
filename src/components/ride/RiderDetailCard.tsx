import React from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { useSessionStore } from '@/stores/sessionStore';
import { X, Navigation, Crosshair, Gauge, Radio, UserCheck } from 'lucide-react';
import { calculateDistanceMeters, formatDistance, formatSpeed, getRiderColor } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface RiderDetailCardProps {
  onFocusRider?: (lng: number, lat: number) => void;
}

export const RiderDetailCard: React.FC<RiderDetailCardProps> = ({ onFocusRider }) => {
  const {
    selectedUserId,
    followingUserId,
    riderLocations,
    userLocation,
    setSelectedUserId,
    setFollowingUserId,
    clearFollowing,
  } = useMapStore();

  const { participants, onlineUserIds } = useRideStore();
  const { user } = useSessionStore();

  // Only display when a rider is selected and is not the current user
  if (!selectedUserId || selectedUserId === user?.id) return null;

  const loc = riderLocations[selectedUserId];
  const participant = participants.find((p) => p.user_id === selectedUserId);
  const isOnline = onlineUserIds.includes(selectedUserId);
  const isFollowing = followingUserId === selectedUserId;

  const displayName = loc?.displayName || participant?.display_name || 'Rider';
  const color = getRiderColor(selectedUserId);
  const vehicleType = loc?.vehicleType || participant?.vehicle_type || 'motorcycle';

  // Calculate distance from current user
  let distanceStr: string | null = null;
  if (userLocation && loc) {
    const distMeters = calculateDistanceMeters(
      userLocation.lat,
      userLocation.lng,
      loc.lat,
      loc.lng
    );
    distanceStr = `${formatDistance(distMeters)} away`;
  }

  const handleToggleFollow = () => {
    if (isFollowing) {
      clearFollowing();
    } else {
      setFollowingUserId(selectedUserId);
      if (loc && onFocusRider) {
        onFocusRider(loc.lng, loc.lat);
      }
    }
  };

  const handleLocate = () => {
    if (loc && onFocusRider) {
      onFocusRider(loc.lng, loc.lat);
    }
  };

  const handleClose = () => {
    setSelectedUserId(null);
  };

  return (
    <div className="glass-panel p-3.5 sm:p-4 rounded-2xl border-white/10 shadow-2xl space-y-3 pointer-events-auto max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-200">
      {/* Header: Avatar, Name, Status, Close */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg border-2 border-white/80 shrink-0"
            style={{ backgroundColor: color }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-white tracking-tight truncate">
                {displayName}
              </h4>
              {participant?.is_host && (
                <span title="Host" className="text-xs shrink-0">👑</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="slate" size="sm" className="capitalize text-[10px] px-1.5 py-0.2">
                {vehicleType}
              </Badge>
              {isOnline ? (
                <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              ) : (
                <span className="text-slate-500 text-[10px]">Offline</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Row: Speed & Distance */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900/60 rounded-xl p-2.5 border border-white/5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Speed</p>
            <p className="text-xs font-bold text-white">
              {loc ? formatSpeed(loc.speed) : '0 km/h'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Distance</p>
            <p className="text-xs font-bold text-white">
              {distanceStr || 'Locating...'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons: Follow on Map & Locate */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          variant={isFollowing ? 'primary' : 'glass'}
          onClick={handleToggleFollow}
          className={`flex-1 font-bold text-xs h-9 ${
            isFollowing
              ? 'bg-brand-500 text-slate-950 shadow-brand-500/20 shadow-lg'
              : 'border-brand-500/40 text-brand-300 hover:text-white'
          }`}
        >
          {isFollowing ? (
            <>
              <UserCheck className="w-3.5 h-3.5 mr-1.5" />
              <span>Following Live</span>
            </>
          ) : (
            <>
              <Navigation className="w-3.5 h-3.5 mr-1.5" />
              <span>Follow Rider</span>
            </>
          )}
        </Button>

        {loc && (
          <Button
            size="sm"
            variant="glass"
            onClick={handleLocate}
            className="h-9 px-3"
            title="Pan camera to rider"
          >
            <Crosshair className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline ml-1 text-xs">Locate</span>
          </Button>
        )}
      </div>
    </div>
  );
};
