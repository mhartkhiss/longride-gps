import React, { useState } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useMapStore } from '@/stores/mapStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ChevronUp, ChevronDown, Users, LogOut, Crosshair, MapPin, Gauge, Navigation, UserCheck } from 'lucide-react';
import { formatDistance, formatDuration, formatSpeed, getRiderColor } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface RiderListDrawerProps {
  onLeaveRide: () => void;
  onFocusRider: (lng: number, lat: number) => void;
}

export const RiderListDrawer: React.FC<RiderListDrawerProps> = ({
  onLeaveRide,
  onFocusRider,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentRide, participants, onlineUserIds, destination, route, isHost } = useRideStore();
  const {
    userLocation,
    riderLocations,
    followingUserId,
    setFollowingUserId,
    clearFollowing,
  } = useMapStore();
  const { user } = useSessionStore();

  const totalParticipants = participants.length;
  const onlineCount = participants.filter((p) => onlineUserIds.includes(p.user_id)).length || (participants.length > 0 ? 1 : 0);

  // Sort: Current user first, online riders second, offline riders last
  const sortedParticipants = [...participants].sort((a, b) => {
    const isAUser = a.user_id === user?.id;
    const isBUser = b.user_id === user?.id;
    if (isAUser) return -1;
    if (isBUser) return 1;

    const isAOnline = onlineUserIds.includes(a.user_id);
    const isBOnline = onlineUserIds.includes(b.user_id);

    if (isAOnline && !isBOnline) return -1;
    if (!isAOnline && isBOnline) return 1;

    if (a.is_host && !b.is_host) return -1;
    if (!a.is_host && b.is_host) return 1;

    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <div
      className={`glass-panel rounded-2xl sm:rounded-2xl border-white/10 shadow-2xl transition-all duration-300 pointer-events-auto flex flex-col ${
        isExpanded ? 'max-h-[70vh] sm:max-h-[480px]' : 'h-auto'
      }`}
    >
      {/* Drawer Handle & Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between cursor-pointer select-none border-b border-white/5 gap-2"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                {currentRide?.name || 'Group Ride'}
              </h3>
              <Badge variant="brand" size="sm" className="shrink-0 text-[9px] sm:text-[10px] px-1.5 py-0.2">
                {onlineCount} Online
              </Badge>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">
              Code: <span className="font-mono font-bold text-brand-300">{currentRide?.room_code}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {route && (
            <div className="flex flex-col items-end text-xs mr-0.5">
              <span className="font-bold text-brand-400 text-[11px] sm:text-xs">{formatDistance(route.distanceMeters)}</span>
              <span className="text-slate-400 text-[9px]">ETA: {formatDuration(route.durationSeconds)}</span>
            </div>
          )}
          <button className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/40 transition-colors shrink-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Destination Card */}
          {destination && (
            <div className="bg-slate-900/90 border border-slate-700/60 rounded-2xl p-3.5 flex items-center justify-between shadow-md">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase font-semibold">Shared Destination</p>
                  <p className="text-sm font-bold text-white">{destination.name}</p>
                </div>
              </div>
              {route && (
                <div className="text-right">
                  <p className="text-sm font-extrabold text-brand-400">{formatDistance(route.distanceMeters)}</p>
                  <p className="text-xs text-slate-400">{formatDuration(route.durationSeconds)}</p>
                </div>
              )}
            </div>
          )}

          {/* Riders List */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Riders ({totalParticipants})
            </p>

            {sortedParticipants.map((p) => {
              const isCurrentUser = p.user_id === user?.id;
              const isOnline = onlineUserIds.includes(p.user_id) || isCurrentUser;
              const liveLoc = isCurrentUser ? userLocation : riderLocations[p.user_id];
              const isStale = liveLoc && Date.now() - liveLoc.timestamp > 30000;
              const color = getRiderColor(p.user_id);

              const isFollowing = followingUserId === p.user_id;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (!isCurrentUser && liveLoc) {
                      onFocusRider(liveLoc.lng, liveLoc.lat);
                    }
                  }}
                  className={`border rounded-2xl p-3 flex items-center justify-between transition-all ${
                    !isCurrentUser && liveLoc ? 'cursor-pointer' : ''
                  } ${
                    !isOnline
                      ? 'opacity-40 bg-slate-900/30 border-white/5 grayscale-[50%]'
                      : isFollowing
                      ? 'bg-purple-950/40 border-purple-500/50 shadow-lg'
                      : 'bg-slate-800/40 hover:bg-slate-800/80 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0 border border-white/20"
                      style={{ backgroundColor: color }}
                    >
                      {p.display_name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name and State */}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white">
                          {p.display_name}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-brand-500/20 text-brand-400 font-bold rounded">
                            You
                          </span>
                        )}
                        {p.is_host && (
                          <span title="Host" className="text-xs">👑</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        {isOnline ? (
                          isStale ? (
                            <span className="text-amber-400 text-[11px] font-medium">GPS Stale</span>
                          ) : (
                            <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Live
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px]">Offline</span>
                        )}

                        {liveLoc && liveLoc.speed !== null && (
                          <span className="text-slate-400 text-[11px] flex items-center gap-0.5">
                            <Gauge className="w-3 h-3 text-slate-500" />
                            {formatSpeed(liveLoc.speed)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {!isCurrentUser && liveLoc && (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Follow Toggle */}
                      <button
                        onClick={() => {
                          if (isFollowing) clearFollowing();
                          else {
                            setFollowingUserId(p.user_id);
                            onFocusRider(liveLoc.lng, liveLoc.lat);
                          }
                        }}
                        title={isFollowing ? 'Stop Following' : 'Follow Rider on Map'}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 ${
                          isFollowing
                            ? 'bg-purple-600 text-white shadow-purple-500/30 shadow-md'
                            : 'bg-slate-700/50 hover:bg-brand-500 hover:text-slate-950 text-slate-300'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Following</span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Follow</span>
                          </>
                        )}
                      </button>

                      {/* Focus Marker */}
                      <button
                        onClick={() => onFocusRider(liveLoc.lng, liveLoc.lat)}
                        title="Locate on Map"
                        className="p-1.5 rounded-xl bg-slate-700/40 hover:bg-slate-700 text-slate-300 transition-all active:scale-95"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leave Ride Button */}
          <div className="pt-2">
            <Button
              variant="danger"
              size="sm"
              onClick={onLeaveRide}
              className="w-full bg-rose-600/80 hover:bg-rose-600 shadow-md shadow-rose-950/40"
            >
              <LogOut className="w-4 h-4" />
              <span>{isHost ? 'End & Leave Ride' : 'Leave Ride Session'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
