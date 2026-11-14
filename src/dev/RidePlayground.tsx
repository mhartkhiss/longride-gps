import React, { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Pause, Play } from 'lucide-react';
import { RideView } from '@/components/ride/RideView';
import { useRideStore } from '@/stores/rideStore';
import { useMapStore } from '@/stores/mapStore';
import { useSessionStore } from '@/stores/sessionStore';
import { GpsFilter } from '@/features/location/gpsFilter';
import { trailStore } from '@/features/location/trailStore';
import { MapboxDirectionsService } from '@/features/routing/mapboxDirections';
import { resetLiveTracks } from '@/features/map/liveState';
import { usePlaceStore } from '@/features/geocoding/placeTracking';
import { bearingDegrees, cumulativeDistances, LngLat, offsetPoint } from '@/lib/geo';
import type { Destination, Ride, RideParticipant, VehicleMode } from '@/types/database';
import type { ChatMessagePayload } from '@/types/realtime';

/**
 * DEV-only ride simulator (`npm run dev` → /dev/ride). Replays a route as noisy
 * 1 Hz GPS through the real filter → map → camera pipeline, plus two fake
 * riders, so the navigation view can be tested without riding or touching the
 * database. Query params: from=lng,lat  to=lng,lat  mode=driving|cycling|walking
 * kmh=30  nodest=1 (skip the shared destination).
 */

const SELF_ID = 'dev-self';
const RIDERS = [
  { id: 'dev-rider-mark', name: 'Mark', lagMeters: 160 },
  { id: 'dev-rider-ana', name: 'Ana', lagMeters: 420 },
];

function parsePoint(value: string | null, fallback: LngLat): LngLat {
  if (!value) return fallback;
  const [lng, lat] = value.split(',').map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : fallback;
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Track {
  coords: LngLat[];
  cum: number[];
  length: number;
}

function pointAt(track: Track, distance: number): { lng: number; lat: number; bearing: number } {
  const d = Math.max(0, Math.min(distance, track.length));
  let i = 1;
  while (i < track.cum.length - 1 && track.cum[i] < d) i++;
  const a = track.coords[i - 1];
  const b = track.coords[i];
  const seg = track.cum[i] - track.cum[i - 1] || 1;
  const t = (d - track.cum[i - 1]) / seg;
  return {
    lng: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    bearing: bearingDegrees(a[1], a[0], b[1], b[0]),
  };
}

const RidePlayground: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const from = parsePoint(params.get('from'), [123.89305, 10.31082]); // Fuente Osmeña, Cebu City
  const to = parsePoint(params.get('to'), [123.90584, 10.33073]); // Cebu IT Park
  const mode = (params.get('mode') as VehicleMode) || 'driving';
  const kmh = Number(params.get('kmh')) || 30;
  const withDestination = params.get('nodest') !== '1';

  const [track, setTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const progressRef = useRef(0);
  const filterRef = useRef(new GpsFilter());

  // Fake session, ride and participants
  useEffect(() => {
    const now = new Date().toISOString();
    useSessionStore.setState({ user: { id: SELF_ID } as User, displayName: 'You', isInitialized: true });
    const ride: Ride = {
      id: 'dev-ride',
      room_code: 'DEV123',
      name: 'Simulated Sunday Ride',
      host_user_id: SELF_ID,
      status: 'active',
      vehicle_mode: mode,
      destination_lat: null,
      destination_lng: null,
      destination_name: null,
      route_version: 1,
      created_at: now,
      updated_at: now,
      expires_at: null,
    };
    const participants: RideParticipant[] = [
      { id: 'p-self', ride_id: ride.id, user_id: SELF_ID, display_name: 'You', vehicle_type: 'motorcycle', is_host: true, joined_at: now, last_seen_at: now },
      ...RIDERS.map((r) => ({
        id: `p-${r.id}`,
        ride_id: ride.id,
        user_id: r.id,
        display_name: r.name,
        vehicle_type: 'motorcycle',
        is_host: false,
        joined_at: now,
        last_seen_at: now,
      })),
    ];
    const rideStore = useRideStore.getState();
    rideStore.setRide(ride, SELF_ID);
    rideStore.setParticipants(participants);
    rideStore.setOnlineUserIds([SELF_ID, ...RIDERS.map((r) => r.id)]);
    rideStore.setRealtimeStatus('CONNECTED');
    trailStore.load('dev-ride');
    trailStore.clear();

    return () => {
      trailStore.reset();
      resetLiveTracks();
      usePlaceStore.getState().reset();
      useMapStore.getState().clearRiderLocations();
      useRideStore.getState().resetRide();
    };
  }, [mode]);

  // Route to replay
  useEffect(() => {
    let cancelled = false;
    MapboxDirectionsService.getRoute(from[0], from[1], to[0], to[1], mode).then((route) => {
      if (cancelled || !route) return;
      const coords = route.geometry.coordinates;
      const cum = cumulativeDistances(coords);
      setTrack({ coords, cum, length: cum[cum.length - 1] });
      if (withDestination) {
        useRideStore.getState().setDestination({ lng: to[0], lat: to[1], name: 'Cebu IT Park' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1 Hz noisy GPS for us, 1.5 s broadcasts for the fake riders
  useEffect(() => {
    if (!track || !isPlaying) return;
    const speed = kmh / 3.6;
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      progressRef.current = Math.min(track.length, progressRef.current + speed);
      const p = pointAt(track, progressRef.current);
      const multipath = tick % 17 === 0; // occasional reflection off a building
      const noise = multipath ? 85 : 4;
      const jittered = offsetPoint(p.lat, p.lng, Math.random() * 360, Math.abs(gaussian()) * noise);
      const raw = {
        lat: jittered.lat,
        lng: jittered.lng,
        accuracy: 5 + Math.random() * 4,
        heading: (p.bearing + gaussian() * 3 + 360) % 360,
        speed: Math.max(0, speed + gaussian() * 0.4),
        altitude: null,
        timestamp: Date.now(),
      };
      const filtered = filterRef.current.process(raw);
      if (filtered) {
        useMapStore.getState().setUserLocation(filtered);
        trailStore.append(SELF_ID, filtered.lng, filtered.lat, filtered.accuracy);
      }

      if (tick % 3 === 0) {
        for (const r of RIDERS) {
          const rp = pointAt(track, progressRef.current - r.lagMeters);
          const loc = {
            userId: r.id,
            displayName: r.name,
            vehicleType: 'motorcycle',
            lat: rp.lat,
            lng: rp.lng,
            accuracy: r.name === 'Ana' ? 35 : 6,
            heading: Math.round(rp.bearing),
            speed: progressRef.current > r.lagMeters ? speed : 0,
            timestamp: Date.now(),
          };
          useMapStore.getState().updateRiderLocation(loc);
          trailStore.append(r.id, loc.lng, loc.lat, loc.accuracy);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [track, isPlaying, kmh]);

  const handleSetDestination = async (dest: Destination | null) => {
    useRideStore.getState().setDestination(dest);
  };

  return (
    <>
      <RideView
        chatMessages={messages}
        unreadCount={0}
        isChatOpen={isChatOpen}
        onOpenChat={() => setIsChatOpen(true)}
        onCloseChat={() => setIsChatOpen(false)}
        onSendChatMessage={(text, isQuickAlert) =>
          setMessages((m) => [...m, { id: String(Date.now()), userId: SELF_ID, displayName: 'You', text, timestamp: Date.now(), isQuickAlert }])
        }
        onSetDestination={handleSetDestination}
        onConfirmLeave={() => window.location.assign('/')}
        isLeaving={false}
        permissionError={null}
      />
      <button
        type="button"
        onClick={() => setIsPlaying((v) => !v)}
        className="fixed left-1/2 -translate-x-1/2 top-[max(0.25rem,env(safe-area-inset-top,0.25rem))] z-[60] h-6 px-2.5 rounded-full bg-fuchsia-700/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-xl"
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        SIM {isPlaying ? 'running' : 'paused'}
      </button>
    </>
  );
};

export default RidePlayground;
