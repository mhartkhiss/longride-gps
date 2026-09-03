import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRideStore } from '@/stores/rideStore';
import { useMapStore } from '@/stores/mapStore';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';
import { GeolocationService } from '@/features/location/geolocation';
import { LocationThrottleFilter, sanitizeGpsPayload } from '@/features/location/locationThrottle';
import { screenWakeLock } from '@/lib/wakeLock';
import { RideRealtimeChannel } from '@/features/realtime/rideChannel';
import { MapboxDirectionsService } from '@/features/routing/mapboxDirections';
import { RideMap } from '@/components/map/RideMap';
import { HostControls } from '@/components/ride/HostControls';
import { RiderListDrawer } from '@/components/ride/RiderListDrawer';
import { RiderDetailCard } from '@/components/ride/RiderDetailCard';
import { LocationStatusBadge } from '@/components/ride/LocationStatusBadge';
import { ChatModal } from '@/components/ride/ChatModal';
import { ConfirmLeaveModal } from '@/components/ui/ConfirmLeaveModal';
import { Loader2, ArrowLeft, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GpsLocation } from '@/features/location/locationTypes';
import { Destination } from '@/types/database';
import { ChatMessagePayload } from '@/types/realtime';

export const RidePage: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();

  const {
    currentRide,
    destination,
    isHost,
    setRide,
    setParticipants,
    addOrUpdateParticipant,
    removeParticipant,
    setDestination,
    setRoute,
    setRealtimeStatus,
    setOnlineUserIds,
    addOnlineUserId,
    removeOnlineUserId,
    resetRide,
  } = useRideStore();

  const {
    userLocation,
    riderLocations,
    isSharingLocation,
    followingUserId,
    selectedUserId,
    setUserLocation,
    updateRiderLocation,
    removeRiderLocation,
    syncActiveRiders,
    clearRiderLocations,
    setCameraMode,
    clearFollowing,
    setSelectedUserId,
  } = useMapStore();

  const { user, displayName, vehicleType, initSession } = useSessionStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const realtimeChannelRef = useRef<RideRealtimeChannel | null>(null);
  const throttleFilterRef = useRef<LocationThrottleFilter>(new LocationThrottleFilter());
  const userLocationRef = useRef<GpsLocation | null>(null);
  const isSharingLocationRef = useRef<boolean>(isSharingLocation);
  const isChatOpenRef = useRef<boolean>(isChatOpen);
  const lastRiderTimestampsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    isSharingLocationRef.current = isSharingLocation;
  }, [isSharingLocation]);

  // 1. Recalculate Route when Destination or Origin changes
  const calculateRoute = useCallback(
    async (dest: Destination, startLoc: GpsLocation | null) => {
      if (!startLoc) return;
      try {
        const result = await MapboxDirectionsService.getRoute(
          startLoc.lng,
          startLoc.lat,
          dest.lng,
          dest.lat,
          currentRide?.vehicle_mode || 'driving'
        );
        setRoute(result);
      } catch (err) {
        console.warn('Failed to calculate directions:', err);
      }
    },
    [currentRide?.vehicle_mode, setRoute]
  );

  // 2. Initialize Ride, Auth, and Realtime Subscriptions
  useEffect(() => {
    if (!rideId) return;

    let isMounted = true;

    const setupSessionAndRide = async () => {
      try {
        setIsLoading(true);
        const activeUser = await initSession();
        if (!activeUser) {
          throw new Error('Could not establish an anonymous session.');
        }

        // Fetch Ride data
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

        localStorage.setItem('longride_active_ride_id', rideId);
        setRide(ride, activeUser.id);

        // Fetch Participants
        const participants = await RideService.getParticipants(rideId);
        if (isMounted) setParticipants(participants);

        // Fetch & Restore Persistent Chat History
        let initialChatMsgs: ChatMessagePayload[] = [];
        try {
          const cached = localStorage.getItem(`ride_chat_${rideId}`);
          if (cached) initialChatMsgs = JSON.parse(cached);
        } catch {}

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
        } catch {}

        // Compute unread messages count comparing against last read timestamp
        let lastReadTimestamp = 0;
        try {
          const savedLastRead = localStorage.getItem(`ride_chat_last_read_${rideId}`);
          if (savedLastRead) lastReadTimestamp = parseInt(savedLastRead, 10) || 0;
        } catch {}

        const missedCount = initialChatMsgs.filter(
          (m) => m.userId !== activeUser.id && m.timestamp > lastReadTimestamp
        ).length;

        if (isMounted) {
          setChatMessages(initialChatMsgs);
          setUnreadCount(missedCount);
          try { localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(initialChatMsgs.slice(-100))); } catch {}
        }

        // Optimistically set current user as online immediately with 0ms lag
        setOnlineUserIds([activeUser.id]);

        // Subscribe to Supabase Realtime (Presence & Broadcast)
        const channel = new RideRealtimeChannel(rideId, {
          onLocationUpdate: (payload) => {
            const lastTimestamp = lastRiderTimestampsRef.current.get(payload.userId) || 0;
            if (payload.timestamp && payload.timestamp < lastTimestamp) {
              return; // Stale packet delayed by cellular jitter; ignore
            }
            lastRiderTimestampsRef.current.set(payload.userId, payload.timestamp);
            updateRiderLocation(payload);
            addOnlineUserId(payload.userId);
          },
          onRouteChange: (payload) => {
            if (payload.destinationLat && payload.destinationLng) {
              const newDest: Destination = {
                lat: payload.destinationLat,
                lng: payload.destinationLng,
                name: payload.destinationName || 'Destination',
              };
              setDestination(newDest);
              calculateRoute(newDest, userLocationRef.current);
            } else {
              setDestination(null);
              setRoute(null);
            }
          },
          onRideEvent: (payload) => {
            if (payload.type === 'ride_ended') {
              localStorage.removeItem('longride_active_ride_id');
              alert('The ride session has ended.');
              navigate('/');
            }
          },
          onChatMessage: (payload) => {
            addOnlineUserId(payload.userId);
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === payload.id)) return prev;
              const updated = [...prev, payload];
              try { localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(updated.slice(-100))); } catch {}
              return updated;
            });

            // Increment unread count only if modal is closed and message is not from current user
            if (!isChatOpenRef.current && payload.userId !== activeUser.id) {
              setUnreadCount((prev) => prev + 1);
            } else if (isChatOpenRef.current) {
              try {
                localStorage.setItem(`ride_chat_last_read_${rideId}`, Date.now().toString());
              } catch {}
            }
          },
          onPresenceSync: (state) => {
            const onlineIds = Object.keys(state);
            // Ensure current active user is always included
            const allOnline = Array.from(new Set([activeUser.id, ...onlineIds]));
            setOnlineUserIds(allOnline);
            syncActiveRiders(allOnline);
          },
          onPresenceJoin: (_key, newPresence) => {
            addOnlineUserId(newPresence.userId);
            addOrUpdateParticipant({
              id: newPresence.userId,
              ride_id: rideId,
              user_id: newPresence.userId,
              display_name: newPresence.displayName,
              vehicle_type: newPresence.vehicleType,
              is_host: newPresence.isHost,
              joined_at: new Date(newPresence.joinedAt).toISOString(),
              last_seen_at: new Date().toISOString(),
            });

            // Immediately announce our latest location to the new rider so they see us without waiting
            if (userLocationRef.current && isSharingLocationRef.current && activeUser) {
              channel.broadcastLocation({
                userId: activeUser.id,
                displayName: displayName || 'Rider',
                vehicleType: vehicleType || 'motorcycle',
                lat: userLocationRef.current.lat,
                lng: userLocationRef.current.lng,
                accuracy: userLocationRef.current.accuracy,
                heading: userLocationRef.current.heading,
                speed: userLocationRef.current.speed,
                timestamp: userLocationRef.current.timestamp,
              });
            }
          },
          onPresenceLeave: (_key, leftPresence) => {
            if (leftPresence?.userId) {
              removeOnlineUserId(leftPresence.userId);
              removeParticipant(leftPresence.userId);
              removeRiderLocation(leftPresence.userId);
            }
          },
          onStatusChange: (status) => {
            if (status === 'SUBSCRIBED') setRealtimeStatus('CONNECTED');
            else if (status === 'CHANNEL_ERROR') setRealtimeStatus('ERROR');
            else setRealtimeStatus('DISCONNECTED');
          },
        });

        await channel.subscribe({
          userId: activeUser.id,
          displayName: displayName || 'Rider',
          isHost: ride.host_user_id === activeUser.id,
          vehicleType: vehicleType || 'motorcycle',
          joinedAt: Date.now(),
          onlineAt: Date.now(),
          location: userLocationRef.current
            ? {
                userId: activeUser.id,
                displayName: displayName || 'Rider',
                vehicleType: vehicleType || 'motorcycle',
                lat: userLocationRef.current.lat,
                lng: userLocationRef.current.lng,
                accuracy: userLocationRef.current.accuracy,
                heading: userLocationRef.current.heading,
                speed: userLocationRef.current.speed,
                timestamp: userLocationRef.current.timestamp,
              }
            : undefined,
        });

        realtimeChannelRef.current = channel;

        // If ride already had a destination, compute route
        if (ride.destination_lat && ride.destination_lng) {
          const initDest: Destination = {
            lat: ride.destination_lat,
            lng: ride.destination_lng,
            name: ride.destination_name || 'Shared Destination',
          };
          setDestination(initDest);
        }

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

    // Prevent phone screen from locking / sleeping while riding
    screenWakeLock.acquire();

    // 3. Start Geolocation Watcher
    GeolocationService.startWatching(
      (pos) => {
        if (!isMounted) return;
        setUserLocation(pos);
        userLocationRef.current = pos;
        setPermissionError(null);

        // Broadcast position if allowed and passes adaptive throttle filter
        if (
          isSharingLocationRef.current &&
          realtimeChannelRef.current &&
          throttleFilterRef.current.shouldBroadcast(pos)
        ) {
          const clean = sanitizeGpsPayload(pos);
          const payload = {
            userId: user?.id || '',
            displayName: displayName || 'Rider',
            vehicleType: vehicleType || 'motorcycle',
            lat: clean.lat,
            lng: clean.lng,
            accuracy: clean.accuracy,
            heading: clean.heading,
            speed: clean.speed,
            timestamp: clean.timestamp,
          };
          realtimeChannelRef.current.broadcastLocation(payload);
          // Note: updatePresence removed from high-frequency GPS ticks to avoid mobile socket congestion
        }
      },
      (geoError) => {
        if (geoError.code === 1) {
          setPermissionError('Location permission denied. Please allow location access to use GPS navigation.');
        } else {
          console.warn('GPS signal warning:', geoError.message);
        }
      }
    );

    // Low-frequency heartbeat (60s) to keep presence active without flooding the mobile socket
    const presenceHeartbeat = setInterval(() => {
      if (isMounted && realtimeChannelRef.current && userLocationRef.current) {
        const clean = sanitizeGpsPayload(userLocationRef.current);
        realtimeChannelRef.current.updatePresence({
          location: {
            userId: user?.id || '',
            displayName: displayName || 'Rider',
            vehicleType: vehicleType || 'motorcycle',
            ...clean,
          },
        });
      }
    }, 60000);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      screenWakeLock.release();
      clearInterval(presenceHeartbeat);
      GeolocationService.stopWatching();
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
      clearRiderLocations();
      resetRide();
    };
  }, [rideId, initSession]);

  // Compute route once user location becomes available if destination exists
  useEffect(() => {
    if (destination && userLocation) {
      calculateRoute(destination, userLocation);
    }
  }, [destination, userLocation, calculateRoute]);

  const handleLeaveRide = () => {
    setIsLeaveModalOpen(true);
  };

  const handleConfirmLeave = async () => {
    if (!rideId) return;
    setIsLeaving(true);
    try {
      localStorage.removeItem('longride_active_ride_id');
      if (isHost) {
        // Host ends the ride for everyone
        await RideService.updateStatus(rideId, 'ended');
        if (realtimeChannelRef.current) {
          await realtimeChannelRef.current.broadcastRideEvent({
            type: 'ride_ended',
            message: 'The host ended the ride session.',
            timestamp: Date.now(),
          });
        }
      } else {
        // Participant leaves
        await RideService.leaveRide(rideId);
      }
      navigate('/');
    } catch (err) {
      console.error('Failed to leave ride:', err);
      navigate('/');
    } finally {
      setIsLeaving(false);
      setIsLeaveModalOpen(false);
    }
  };

  const handleFocusRider = (lng: number, lat: number) => {
    setCameraMode('FREE');
    const map = (window as unknown as { __activeMap?: mapboxgl.Map }).__activeMap;
    if (map) {
      map.flyTo({ center: [lng, lat], zoom: 16, duration: 800 });
    }
  };

  const handleSendChatMessage = (text: string, isQuickAlert?: boolean) => {
    if (!user || !rideId) return;
    const msg: ChatMessagePayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      userId: user.id,
      displayName: displayName || 'Rider',
      text,
      timestamp: Date.now(),
      isQuickAlert,
    };
    setChatMessages((prev) => {
      const updated = [...prev, msg];
      try { localStorage.setItem(`ride_chat_${rideId}`, JSON.stringify(updated.slice(-100))); } catch {}
      return updated;
    });
    realtimeChannelRef.current?.broadcastChatMessage(msg);
    RideService.sendRideMessage(rideId, user.id, displayName || 'Rider', text, !!isQuickAlert).catch(() => {});
  };

  const handleOpenChat = () => {
    setIsChatOpen(true);
    setUnreadCount(0);
    if (rideId) {
      try {
        localStorage.setItem(`ride_chat_last_read_${rideId}`, Date.now().toString());
      } catch {}
    }
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
    setUnreadCount(0);
    if (rideId) {
      try {
        localStorage.setItem(`ride_chat_last_read_${rideId}`, Date.now().toString());
      } catch {}
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        <p className="text-sm text-slate-400 font-medium">Connecting to ride session...</p>
      </div>
    );
  }

  if (error || !currentRide) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full space-y-4 border-rose-500/30">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Ride Unavailable</h2>
          <p className="text-xs text-slate-400">{error || 'Could not load ride details.'}</p>
          <Button variant="primary" onClick={() => navigate('/')} className="w-full">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-slate-950 flex flex-col">
      {/* Top Floating Glass Header */}
      <header className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 z-30 flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-none pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        {/* Left: Chat Icon Button */}
        <div className="pointer-events-auto">
          <button
            onClick={handleOpenChat}
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-900/85 hover:bg-slate-800 border border-brand-500/30 hover:border-brand-500/60 text-brand-400 hover:text-white flex items-center justify-center shadow-xl shadow-brand-500/10 backdrop-blur-md transition-all active:scale-95"
            title="Group Ride Chat"
          >
            <MessageSquare className="w-5 h-5 stroke-[2]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-red-600 text-white font-black text-[10px] rounded-full flex items-center justify-center border-2 border-slate-950 animate-bounce shadow-lg shadow-red-600/60">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Controls & Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          <LocationStatusBadge />
          {isHost && <HostControls realtimeChannel={realtimeChannelRef.current} />}
        </div>
      </header>

      {/* Permission Warning Banner */}
      {permissionError && (
        <div className="absolute top-20 left-4 right-4 z-30 max-w-md mx-auto glass-panel border-rose-500/50 bg-rose-950/70 p-3 rounded-2xl text-xs text-rose-200 flex items-center gap-2.5 shadow-2xl">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{permissionError}</span>
        </div>
      )}

      {/* Fullscreen Interactive Map */}
      <main className="flex-1 w-full h-full relative">
        <RideMap />
      </main>

      {/* Following Live Status Pill (when detail card is not open) */}
      {followingUserId && !selectedUserId && (
        <div className="absolute top-16 left-3 sm:top-20 sm:left-4 z-30 pointer-events-auto glass-panel px-3 py-1.5 rounded-2xl border-purple-500/50 bg-purple-950/85 shadow-2xl flex items-center gap-2 text-xs text-purple-200 animate-in fade-in duration-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
          </span>
          <button
            onClick={() => setSelectedUserId(followingUserId)}
            className="font-bold truncate max-w-[140px] hover:underline text-left"
          >
            Following {riderLocations[followingUserId]?.displayName || 'Rider'}
          </button>
          <button
            onClick={clearFollowing}
            className="px-2 py-0.5 rounded-lg bg-purple-800/80 hover:bg-purple-700 text-white text-[10px] font-bold transition-colors shadow"
          >
            Stop
          </button>
        </div>
      )}

      {/* Selected Rider Detail / Follow Card (Opened on map icon tap) */}
      <div className="absolute top-16 sm:top-auto sm:bottom-4 sm:left-[410px] left-3 right-3 sm:right-auto sm:w-80 z-40 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
        <RiderDetailCard onFocusRider={handleFocusRider} />
      </div>

      {/* Bottom Floating Rider Drawer */}
      <div className="absolute bottom-4 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-auto sm:w-96 z-30 pointer-events-none pb-[env(safe-area-inset-bottom,0.75rem)]">
        <RiderListDrawer
          onLeaveRide={handleLeaveRide}
          onFocusRider={handleFocusRider}
        />
      </div>

      {/* Realtime Group Ride Chat Modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={handleCloseChat}
        rideName={currentRide.name}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
      />

      {/* Leave Ride / End Ride Confirmation Dialog */}
      <ConfirmLeaveModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={handleConfirmLeave}
        isHost={isHost}
        isLoading={isLeaving}
      />
    </div>
  );
};
