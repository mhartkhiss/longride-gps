import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Flag, Loader2 } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { useMapStore } from '@/stores/mapStore';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';
import { GeolocationService } from '@/features/location/geolocation';
import { GpsFilter } from '@/features/location/gpsFilter';
import { LocationThrottleFilter, sanitizeGpsPayload } from '@/features/location/locationThrottle';
import { trailStore } from '@/features/location/trailStore';
import { resetLiveTracks } from '@/features/map/liveState';
import { usePlaceStore } from '@/features/geocoding/placeTracking';
import { screenWakeLock } from '@/lib/wakeLock';
import { RideRealtimeChannel } from '@/features/realtime/rideChannel';
import { RideView } from '@/components/ride/RideView';
import { Button } from '@/components/ui/Button';
import { GpsLocation } from '@/features/location/locationTypes';
import { Destination } from '@/types/database';
import { ChatMessagePayload, LocationBroadcastPayload } from '@/types/realtime';

interface RiderIdentity {
  userId: string;
  displayName: string;
  vehicleType: string;
  avatarUrl?: string;
}

export const RidePage: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();

  const currentRide = useRideStore((s) => s.currentRide);
  const isHost = useRideStore((s) => s.isHost);
  const isSharingLocation = useMapStore((s) => s.isSharingLocation);
  const initSession = useSessionStore((s) => s.initSession);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  const realtimeChannelRef = useRef<RideRealtimeChannel | null>(null);
  const throttleFilterRef = useRef(new LocationThrottleFilter());
  const gpsFilterRef = useRef(new GpsFilter());
  const userLocationRef = useRef<GpsLocation | null>(null);
  const isChatOpenRef = useRef(false);
  const lastRiderTimestampsRef = useRef<Map<string, number>>(new Map());
  /**
   * Who we broadcast as. Filled in once the session resolves — reading `user`
   * from the first render left it empty after a page refresh / auto-rejoin.
   */
  const identityRef = useRef<RiderIdentity | null>(null);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  // Resuming sharing should announce our position immediately
  useEffect(() => {
    if (isSharingLocation) throttleFilterRef.current.reset();
  }, [isSharingLocation]);

  const buildPayload = useCallback((loc: GpsLocation | null): LocationBroadcastPayload | null => {
    const id = identityRef.current;
    if (!id || !loc) return null;
    return { ...id, ...sanitizeGpsPayload(loc) };
  }, []);

  // Initialize ride, auth, realtime and GPS
  useEffect(() => {
    if (!rideId) return;

    let isMounted = true;
    const ride$ = useRideStore.getState();
    const map$ = useMapStore.getState();
    trailStore.load(rideId);

    const setupSessionAndRide = async () => {
      try {
        setIsLoading(true);
        const activeUser = await initSession();
        if (!activeUser) {
          throw new Error('Could not establish an anonymous session.');
        }

        const ride = await RideService.getRideById(rideId);
        if (!ride) {
          localStorage.removeItem('longride_active_ride_id');
          throw new Error('Ride session not found or has expired.');
        }

        if (ride.status === 'ended') {
          localStorage.removeItem('longride_active_ride_id');
          throw new Error('This ride session has already ended.');
        }

        if (!isMounted) return;

        const session = useSessionStore.getState();
        const identity: RiderIdentity = {
          userId: activeUser.id,
          displayName: session.displayName || 'Rider',
          vehicleType: session.vehicleType || 'motorcycle',
          avatarUrl: session.avatarUrl || undefined,
        };
        identityRef.current = identity;

        localStorage.setItem('longride_active_ride_id', rideId);
        ride$.setRide(ride, activeUser.id);

        const participants = await RideService.getParticipants(rideId);
        if (isMounted) ride$.setParticipants(participants);

        // Restore persistent chat history (local cache + database)
        let initialChatMsgs: ChatMessagePayload[] = [];
        try {
          const cached = localStorage.getItem(`ride_chat_${rideId}`);
          if (cached) initialChatMsgs = JSON.parse(cached);
        } catch {
          // ignore corrupt cache
        }

        try {
          const dbMsgs = await RideService.getRideMessages(rideId);
          if (dbMsgs && dbMsgs.length > 0) {
            const mappedDb: ChatMessagePayload[] = dbMsgs.map((m) => ({
              id: m.id,
              userId: m.user_id,
              displayName: m.display_name,
              text: m.text,
              timestamp: new Date(m.created_at).getTime(),
              isQuickAlert: m.is_quick_alert,
            }));
            const merged = new Map<string, ChatMessagePayload>();
            initialChatMsgs.forEach((m) => merged.set(m.id, m));
            mappedDb.forEach((m) => merged.set(m.id, m));
            initialChatMsgs = Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
          }
        } catch {
          // offline — keep the cached history
        }

        let lastReadTimestamp = 0;
        try {
          const savedLastRead = localStorage.getItem(`ride_chat_last_read_${rideId}`);
          if (savedLastRead) lastReadTimestamp = parseInt(savedLastRead, 10) || 0;
        } catch {
          // ignore
        }

        const missedCount = initialChatMsgs.filter(
          (m) => m.userId !== activeUser.id && m.timestamp > lastReadTimestamp
        ).length;

        if (isMounted) {
          setChatMessages(initialChatMsgs);
          setUnreadCount(missedCount);
          try {
            localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(initialChatMsgs.slice(-100)));
          } catch {
            // ignore
          }
        }

        // Optimistically mark ourselves online
        ride$.setOnlineUserIds([activeUser.id]);

        const channel = new RideRealtimeChannel(rideId, {
          onLocationUpdate: (payload) => {
            if (!payload?.userId) return;
            const lastTimestamp = lastRiderTimestampsRef.current.get(payload.userId) || 0;
            if (payload.timestamp && payload.timestamp < lastTimestamp) {
              return; // stale packet delayed by cellular jitter
            }
            lastRiderTimestampsRef.current.set(payload.userId, payload.timestamp);
            useMapStore.getState().updateRiderLocation(payload);
            useRideStore.getState().addOnlineUserId(payload.userId);
            trailStore.append(payload.userId, payload.lng, payload.lat, payload.accuracy);
          },
          onRouteChange: (payload) => {
            // The route itself is (re)planned by useRouteNavigation from our own position
            if (payload.destinationLat && payload.destinationLng) {
              useRideStore.getState().setDestination({
                lat: payload.destinationLat,
                lng: payload.destinationLng,
                name: payload.destinationName || 'Destination',
              });
            } else {
              useRideStore.getState().setDestination(null);
            }
          },
          onRideEvent: (payload) => {
            if (payload.type === 'ride_ended') {
              localStorage.removeItem('longride_active_ride_id');
              trailStore.discard(rideId);
              setEndedNotice(payload.message || 'The host ended the ride.');
            }
          },
          onChatMessage: (payload) => {
            useRideStore.getState().addOnlineUserId(payload.userId);
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === payload.id)) return prev;
              const updated = [...prev, payload];
              try {
                localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(updated.slice(-100)));
              } catch {
                // ignore
              }
              return updated;
            });

            if (!isChatOpenRef.current && payload.userId !== activeUser.id) {
              setUnreadCount((prev) => prev + 1);
            } else if (isChatOpenRef.current) {
              try {
                localStorage.setItem(`ride_chat_last_read_${rideId}`, Date.now().toString());
              } catch {
                // ignore
              }
            }
          },
          onPresenceSync: (state) => {
            const allOnline = Array.from(new Set([activeUser.id, ...Object.keys(state)]));
            useRideStore.getState().setOnlineUserIds(allOnline);
            useMapStore.getState().syncActiveRiders(allOnline);
          },
          onPresenceJoin: (_key, newPresence) => {
            useRideStore.getState().addOnlineUserId(newPresence.userId);
            useRideStore.getState().addOrUpdateParticipant({
              id: newPresence.userId,
              ride_id: rideId,
              user_id: newPresence.userId,
              display_name: newPresence.displayName,
              vehicle_type: newPresence.vehicleType,
              avatar_url: newPresence.avatarUrl,
              is_host: newPresence.isHost,
              joined_at: new Date(newPresence.joinedAt).toISOString(),
              last_seen_at: new Date().toISOString(),
            });

            // Announce our latest position so the newcomer sees us right away
            const payload = buildPayload(userLocationRef.current);
            if (payload && useMapStore.getState().isSharingLocation) channel.broadcastLocation(payload);
          },
          onPresenceLeave: (_key, leftPresence) => {
            if (leftPresence?.userId) {
              useRideStore.getState().removeOnlineUserId(leftPresence.userId);
              useRideStore.getState().removeParticipant(leftPresence.userId);
              useMapStore.getState().removeRiderLocation(leftPresence.userId);
            }
          },
          onStatusChange: (status) => {
            const setStatus = useRideStore.getState().setRealtimeStatus;
            if (status === 'SUBSCRIBED') setStatus('CONNECTED');
            else if (status === 'CHANNEL_ERROR') setStatus('ERROR');
            else setStatus('DISCONNECTED');
          },
        });

        useRideStore.getState().setRealtimeStatus('CONNECTING');
        await channel.subscribe({
          ...identity,
          isHost: ride.host_user_id === activeUser.id,
          joinedAt: Date.now(),
          onlineAt: Date.now(),
          location: buildPayload(userLocationRef.current) ?? undefined,
        });

        realtimeChannelRef.current = channel;
        setIsLoading(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error joining ride';
        if (isMounted) {
          setError(msg);
          setIsLoading(false);
        }
      }
    };

    setupSessionAndRide();

    // Prevent the phone screen from sleeping while riding
    screenWakeLock.acquire();

    // GPS: raw fix → smoothing filter → map / trail → throttled broadcast
    GeolocationService.startWatching(
      (raw) => {
        if (!isMounted) return;
        setPermissionError(null);
        const pos = gpsFilterRef.current.process(raw);
        if (!pos) return;

        userLocationRef.current = pos;
        map$.setUserLocation(pos);
        const selfId = identityRef.current?.userId;
        if (selfId) trailStore.append(selfId, pos.lng, pos.lat, pos.accuracy);

        if (
          useMapStore.getState().isSharingLocation &&
          realtimeChannelRef.current &&
          throttleFilterRef.current.shouldBroadcast(pos)
        ) {
          const payload = buildPayload(pos);
          if (payload) realtimeChannelRef.current.broadcastLocation(payload);
        }
      },
      (geoError) => {
        if (geoError.code === 1) {
          setPermissionError('Location permission denied. Allow location access in your browser settings to share your position.');
        } else {
          console.warn('GPS signal warning:', geoError.message);
        }
      }
    );

    // Low-frequency presence heartbeat keeps us "online" without flooding the socket
    const presenceHeartbeat = setInterval(() => {
      const payload = buildPayload(userLocationRef.current);
      if (isMounted && realtimeChannelRef.current && payload) {
        realtimeChannelRef.current.updatePresence({ userId: payload.userId, location: payload });
      }
    }, 60000);

    const gpsFilter = gpsFilterRef.current;
    return () => {
      isMounted = false;
      screenWakeLock.release();
      clearInterval(presenceHeartbeat);
      GeolocationService.stopWatching();
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
      gpsFilter.reset();
      trailStore.reset();
      resetLiveTracks();
      usePlaceStore.getState().reset();
      useMapStore.getState().clearRiderLocations();
      useRideStore.getState().resetRide();
    };
  }, [rideId, initSession, buildPayload]);

  const handleSetDestination = useCallback(async (dest: Destination | null) => {
    const ride = useRideStore.getState().currentRide;
    if (!ride) return;
    try {
      const updatedRide = await RideService.updateDestination(ride.id, dest);
      // Set the destination before the ride row so a cleared destination stays cleared
      useRideStore.getState().setDestination(dest);
      useRideStore.getState().setRide(updatedRide);

      await realtimeChannelRef.current?.broadcastRouteUpdated({
        routeVersion: updatedRide.route_version,
        destinationLat: dest?.lat ?? null,
        destinationLng: dest?.lng ?? null,
        destinationName: dest?.name ?? null,
        vehicleMode: updatedRide.vehicle_mode,
        updatedBy: ride.host_user_id,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Failed to update destination:', err);
      throw err;
    }
  }, []);

  const handleConfirmLeave = async () => {
    if (!rideId) return;
    setIsLeaving(true);
    try {
      localStorage.removeItem('longride_active_ride_id');
      trailStore.discard(rideId);
      if (isHost) {
        // Host ends the ride for everyone
        await RideService.updateStatus(rideId, 'ended');
        await realtimeChannelRef.current?.broadcastRideEvent({
          type: 'ride_ended',
          message: 'The host ended the ride session.',
          timestamp: Date.now(),
        });
      } else {
        await RideService.leaveRide(rideId);
      }
    } catch (err) {
      console.error('Failed to leave ride:', err);
    } finally {
      setIsLeaving(false);
      navigate('/');
    }
  };

  const handleSendChatMessage = (text: string, isQuickAlert?: boolean) => {
    const id = identityRef.current;
    if (!id || !rideId) return;
    const msg: ChatMessagePayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      userId: id.userId,
      displayName: id.displayName,
      text,
      timestamp: Date.now(),
      isQuickAlert,
    };
    setChatMessages((prev) => {
      const updated = [...prev, msg];
      try {
        localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(updated.slice(-100)));
      } catch {
        // ignore
      }
      return updated;
    });
    realtimeChannelRef.current?.broadcastChatMessage(msg);
    RideService.sendRideMessage(rideId, id.userId, id.displayName, text, !!isQuickAlert).catch(() => {});
  };

  const markChatRead = () => {
    setUnreadCount(0);
    if (!rideId) return;
    try {
      localStorage.setItem(`ride_chat_last_read_${rideId}`, Date.now().toString());
    } catch {
      // ignore
    }
  };

  if (endedNotice) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-panel p-8 rounded-3xl max-w-sm w-full space-y-4 lr-anim-pop">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center mx-auto">
            <Flag className="w-7 h-7 text-brand-300" />
          </div>
          <h2 className="text-xl font-extrabold">Ride ended</h2>
          <p className="text-sm text-slate-400">{endedNotice}</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/')} className="w-full">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        <p className="text-sm text-slate-400 font-medium">Connecting to ride session…</p>
      </div>
    );
  }

  if (error || !currentRide) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full space-y-4 border-rose-500/30 lr-anim-pop">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Ride unavailable</h2>
          <p className="text-sm text-slate-400">{error || 'Could not load ride details.'}</p>
          <Button variant="primary" onClick={() => navigate('/')} className="w-full">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <RideView
      chatMessages={chatMessages}
      unreadCount={unreadCount}
      isChatOpen={isChatOpen}
      onOpenChat={() => {
        setIsChatOpen(true);
        markChatRead();
      }}
      onCloseChat={() => {
        setIsChatOpen(false);
        markChatRead();
      }}
      onSendChatMessage={handleSendChatMessage}
      onSetDestination={handleSetDestination}
      onConfirmLeave={handleConfirmLeave}
      isLeaving={isLeaving}
      permissionError={permissionError}
    />
  );
};
