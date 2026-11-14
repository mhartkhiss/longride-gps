import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  Copy,
  Crosshair,
  Flag,
  LogOut,
  MapPin,
  Navigation,
  Pencil,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { useMapStore } from '@/stores/mapStore';
import { useSessionStore } from '@/stores/sessionStore';
import {
  calculateDistanceMeters,
  cn,
  formatArrivalTime,
  formatDistance,
  formatDuration,
  formatTimeAgo,
  getRiderColor,
  haptic,
  speedToKmh,
} from '@/lib/utils';

interface RideSheetProps {
  onLeaveRide: () => void;
  onFocusRider: (lng: number, lat: number) => void;
  onOpenDestination: () => void;
  onClearDestination: () => void;
  onInvite: () => void;
}

const STALE_MS = 30000;

/**
 * Bottom sheet: trip summary (ETA / distance) at a glance, expands to the
 * rider list. Drag the handle or tap the header to open and close it.
 */
export const RideSheet: React.FC<RideSheetProps> = ({
  onLeaveRide,
  onFocusRider,
  onOpenDestination,
  onClearDestination,
  onInvite,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const peekRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; moved: boolean } | null>(null);

  const currentRide = useRideStore((s) => s.currentRide);
  const participants = useRideStore((s) => s.participants);
  const onlineUserIds = useRideStore((s) => s.onlineUserIds);
  const destination = useRideStore((s) => s.destination);
  const route = useRideStore((s) => s.route);
  const progress = useRideStore((s) => s.routeProgress);
  const isHost = useRideStore((s) => s.isHost);
  const userLocation = useMapStore((s) => s.userLocation);
  const riderLocations = useMapStore((s) => s.riderLocations);
  const followingUserId = useMapStore((s) => s.followingUserId);
  const setFollowingUserId = useMapStore((s) => s.setFollowingUserId);
  const clearFollowing = useMapStore((s) => s.clearFollowing);
  const setUiInsets = useMapStore((s) => s.setUiInsets);
  const user = useSessionStore((s) => s.user);

  // Report the always-visible part of the sheet so the camera keeps the puck above it
  useLayoutEffect(() => {
    const el = peekRef.current;
    if (!el) return;
    const report = () => setUiInsets({ bottom: Math.round(el.getBoundingClientRect().height) + 8 });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setUiInsets]);

  const onlineCount = Math.max(
    participants.filter((p) => onlineUserIds.includes(p.user_id)).length,
    participants.length > 0 ? 1 : 0
  );

  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    const aOnline = onlineUserIds.includes(a.user_id);
    const bOnline = onlineUserIds.includes(b.user_id);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    if (a.is_host !== b.is_host) return a.is_host ? -1 : 1;
    return a.display_name.localeCompare(b.display_name);
  });

  const remainingSeconds = progress?.remainingSeconds ?? route?.durationSeconds ?? null;
  const remainingMeters = progress?.remainingMeters ?? route?.distanceMeters ?? null;

  const toggle = (next?: boolean) => {
    haptic(15);
    setIsExpanded((v) => (next === undefined ? !v : next));
  };

  // Swipe up / down on the handle area
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 8) d.moved = true;
    if (dy < -36) {
      dragRef.current = null;
      if (!isExpanded) toggle(true);
    } else if (dy > 36) {
      dragRef.current = null;
      if (isExpanded) toggle(false);
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) toggle();
  };

  const copyCode = async () => {
    if (!currentRide) return;
    try {
      await navigator.clipboard.writeText(currentRide.room_code);
      haptic(20);
    } catch {
      onInvite();
    }
  };

  return (
    <div
      className={cn(
        'pointer-events-auto glass-panel bg-slate-900/90 border-white/10 rounded-t-[28px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-[max-height] duration-300 ease-out',
        isExpanded ? 'max-h-[72dvh]' : 'max-h-[40dvh]'
      )}
    >
      {/* ── Peek: always visible ── */}
      <div ref={peekRef} className="shrink-0">
        <div
          className="pt-2.5 pb-1 flex justify-center cursor-grab touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragRef.current = null)}
          role="button"
          aria-label={isExpanded ? 'Collapse ride panel' : 'Expand ride panel'}
        >
          <span className="w-10 h-1.5 rounded-full bg-slate-500/70" />
        </div>

        <div className="px-4 pb-3">
          {destination ? (
            <button type="button" onClick={() => toggle()} className="w-full flex items-center gap-3 text-left">
              <div className="min-w-0 flex-1">
                {progress?.arrived ? (
                  <span className="text-2xl font-black text-brand-300 leading-tight">Arrived</span>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-brand-300 tabular-nums leading-tight">
                      {remainingSeconds !== null ? formatDuration(remainingSeconds) : '—'}
                    </span>
                    {remainingMeters !== null && (
                      <span className="text-sm font-semibold text-slate-300 tabular-nums">{formatDistance(remainingMeters)}</span>
                    )}
                    {remainingSeconds !== null && (
                      <span className="text-xs text-slate-400 tabular-nums">· {formatArrivalTime(remainingSeconds)}</span>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                  <Flag className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="truncate">{destination.name}</span>
                </p>
              </div>
              <span className="shrink-0 h-10 pl-2.5 pr-3 rounded-2xl bg-slate-800/80 border border-white/10 flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Users className="w-4 h-4 text-brand-300" />
                {onlineCount}
                <ChevronUp className={cn('w-4 h-4 text-slate-400 transition-transform', isExpanded && 'rotate-180')} />
              </span>
            </button>
          ) : (
            <div className="space-y-2.5">
              <button type="button" onClick={() => toggle()} className="w-full flex items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold text-white truncate">{currentRide?.name || 'Group Ride'}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {onlineCount} online · {participants.length} in ride
                  </p>
                </div>
                <ChevronUp className={cn('w-5 h-5 text-slate-400 transition-transform shrink-0', isExpanded && 'rotate-180')} />
              </button>
              <div className="flex gap-2">
                {isHost && (
                  <button
                    type="button"
                    onClick={onOpenDestination}
                    className="flex-1 h-11 rounded-2xl bg-brand-500 text-slate-950 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform shadow-lg shadow-brand-500/20"
                  >
                    <MapPin className="w-4 h-4" />
                    Set destination
                  </button>
                )}
                <button
                  type="button"
                  onClick={onInvite}
                  className="flex-1 h-11 rounded-2xl bg-slate-800/90 border border-white/10 text-slate-100 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <UserPlus className="w-4 h-4 text-brand-300" />
                  Invite · <span className="font-mono tracking-wider text-brand-300">{currentRide?.room_code}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Expanded content ── */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] space-y-4 lr-anim-fade">
          {destination && (
            <section className="rounded-2xl bg-slate-950/60 border border-white/10 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
                  <Flag className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Shared destination</p>
                  <p className="text-sm font-bold text-white truncate">{destination.name}</p>
                  {remainingMeters !== null && remainingSeconds !== null && (
                    <p className="text-xs text-slate-400 tabular-nums">
                      {formatDistance(remainingMeters)} · {formatDuration(remainingSeconds)} · arrive {formatArrivalTime(remainingSeconds)}
                    </p>
                  )}
                </div>
              </div>
              {isHost && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onOpenDestination}
                    className="flex-1 h-10 rounded-xl bg-slate-800/90 border border-white/10 text-xs font-bold text-slate-100 flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Change
                  </button>
                  <button
                    type="button"
                    onClick={onClearDestination}
                    className="flex-1 h-10 rounded-xl bg-slate-800/90 border border-white/10 text-xs font-bold text-rose-300 flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" /> End navigation
                  </button>
                </div>
              )}
            </section>
          )}

          {destination && (
            <section className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{currentRide?.name}</p>
                <p className="text-xs text-slate-400">
                  {onlineCount} online · {participants.length} in ride
                </p>
              </div>
              <button
                type="button"
                onClick={copyCode}
                title="Copy room code"
                className="h-10 px-3 rounded-xl bg-slate-800/90 border border-white/10 font-mono text-sm font-bold tracking-widest text-brand-300 flex items-center gap-1.5"
              >
                {currentRide?.room_code}
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                type="button"
                onClick={onInvite}
                aria-label="Invite riders"
                className="w-10 h-10 rounded-xl bg-slate-800/90 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </section>
          )}

          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">Riders</p>
            {sortedParticipants.map((p) => {
              const isMe = p.user_id === user?.id;
              const isOnline = isMe || onlineUserIds.includes(p.user_id);
              const live = isMe ? userLocation : riderLocations[p.user_id];
              const isStale = !!live && Date.now() - live.timestamp > STALE_MS;
              const isFollowing = followingUserId === p.user_id;
              const color = getRiderColor(p.user_id);
              const kmh = live ? speedToKmh(live.speed) : 0;
              const distance =
                !isMe && live && userLocation
                  ? calculateDistanceMeters(userLocation.lat, userLocation.lng, live.lat, live.lng)
                  : null;

              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-2xl border p-2.5 flex items-center gap-3 transition-colors',
                    !isOnline
                      ? 'opacity-50 bg-slate-900/40 border-white/5'
                      : isFollowing
                      ? 'bg-purple-950/50 border-purple-500/50'
                      : 'bg-slate-800/40 border-white/5'
                  )}
                >
                  <div
                    className="relative w-10 h-10 rounded-full border-2 border-white/80 flex items-center justify-center text-white font-black text-sm shrink-0 overflow-hidden"
                    style={{ backgroundColor: color }}
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      p.display_name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-bold text-white truncate">{p.display_name}</span>
                      {isMe && (
                        <span className="text-[10px] px-1.5 rounded bg-sky-500/20 text-sky-300 font-bold shrink-0">You</span>
                      )}
                      {p.is_host && <span title="Host" className="text-xs shrink-0">👑</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                      {!isOnline ? (
                        <span>Offline</span>
                      ) : !live ? (
                        <span>Waiting for GPS…</span>
                      ) : isStale ? (
                        <span className="text-amber-400">Signal lost · {formatTimeAgo(live.timestamp)}</span>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Live" />
                          <span className="tabular-nums">{kmh} km/h</span>
                          {distance !== null && <span className="tabular-nums whitespace-nowrap">· {formatDistance(distance)}</span>}
                        </>
                      )}
                    </p>
                  </div>

                  {!isMe && live && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          haptic(25);
                          if (isFollowing) clearFollowing();
                          else setFollowingUserId(p.user_id);
                        }}
                        aria-label={isFollowing ? `Stop following ${p.display_name}` : `Follow ${p.display_name}`}
                        className={cn(
                          'h-11 px-3 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors active:scale-95',
                          isFollowing ? 'bg-purple-600 text-white' : 'bg-slate-700/60 text-slate-100'
                        )}
                      >
                        {isFollowing ? <UserCheck className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          haptic(15);
                          onFocusRider(live.lng, live.lat);
                        }}
                        aria-label={`Show ${p.display_name} on the map`}
                        className="w-11 h-11 rounded-xl bg-slate-700/60 text-slate-200 flex items-center justify-center active:scale-95 transition-transform"
                      >
                        <Crosshair className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <button
            type="button"
            onClick={onLeaveRide}
            className="w-full h-12 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <LogOut className="w-4 h-4" />
            {isHost ? 'End ride for everyone' : 'Leave ride'}
          </button>
        </div>
      )}
    </div>
  );
};
