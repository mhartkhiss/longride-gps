import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';
import { RideParticipant } from '@/types/database';
import { escapeHtml, getRiderColor, speedToKmh } from '@/lib/utils';
import { metersPerPixel } from '@/lib/geo';
import { addFrameTask } from '@/features/map/frameLoop';
import { liveTracks } from '@/features/map/liveState';
import { MotionTrack } from '@/features/map/motion';

interface RiderMarkerLayerProps {
  map: mapboxgl.Map | null;
  currentUserLocation: GpsLocation | null;
  currentUserId: string;
  riderLocations: Record<string, LocationBroadcastPayload>;
  participants: RideParticipant[];
  followingUserId?: string | null;
  onSelectRider?: (userId: string) => void;
}

const STALE_MS = 30000;
const MOVING_MPS = 1.4;
/** Other riders only get an accuracy halo when their fix is genuinely rough. */
const RIDER_RING_MIN_ACCURACY = 25;

interface SelfPuck {
  ground: mapboxgl.Marker;
  dot: mapboxgl.Marker;
  ring: HTMLElement;
  arrow: HTMLElement;
  beam: HTMLElement;
  dotEl: HTMLElement;
  lastRingPx: number;
  lastMoving: boolean | null;
}

interface RiderMarker {
  marker: mapboxgl.Marker;
  ringMarker: mapboxgl.Marker;
  ring: HTMLElement;
  pointer: HTMLElement;
  label: HTMLElement;
  bubble: HTMLElement;
  renderKey: string;
  lastRingPx: number;
  lastRotation: number | null;
}

function createSelfPuck(map: mapboxgl.Map): SelfPuck {
  const groundEl = document.createElement('div');
  groundEl.className = 'lr-ground';
  groundEl.innerHTML = `
    <div class="lr-accuracy lr-accuracy--self"></div>
    <div class="lr-beam"></div>
    <svg class="lr-nav-arrow" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 L41 42 L24 33 L7 42 Z" />
    </svg>`;
  const ground = new mapboxgl.Marker({
    element: groundEl,
    anchor: 'center',
    rotationAlignment: 'map',
    pitchAlignment: 'map',
  })
    .setLngLat([0, 0])
    .addTo(map);

  const dotEl = document.createElement('div');
  dotEl.className = 'lr-self-dot';
  dotEl.innerHTML = '<span class="lr-self-dot__halo"></span><span class="lr-self-dot__core"></span>';
  const dot = new mapboxgl.Marker({ element: dotEl, anchor: 'center' }).setLngLat([0, 0]).addTo(map);

  return {
    ground,
    dot,
    ring: groundEl.querySelector('.lr-accuracy') as HTMLElement,
    arrow: groundEl.querySelector('.lr-nav-arrow') as unknown as HTMLElement,
    beam: groundEl.querySelector('.lr-beam') as HTMLElement,
    dotEl,
    lastRingPx: -1,
    lastMoving: null,
  };
}

function riderRenderKey(
  loc: LocationBroadcastPayload,
  participant: RideParticipant | undefined,
  isFollowed: boolean,
  isStale: boolean
): string {
  const kmh = speedToKmh(loc.speed);
  const speedBucket = kmh >= 5 ? Math.round(kmh / 2) * 2 : 0;
  return [
    loc.displayName,
    loc.avatarUrl || participant?.avatar_url || '',
    participant?.is_host ? 'h' : '',
    isFollowed ? 'f' : '',
    isStale ? 's' : '',
    speedBucket,
  ].join('|');
}

function renderRiderContent(
  rm: RiderMarker,
  loc: LocationBroadcastPayload,
  participant: RideParticipant | undefined,
  isFollowed: boolean,
  isStale: boolean
) {
  const color = getRiderColor(loc.userId);
  const name = escapeHtml(loc.displayName || participant?.display_name || 'Rider');
  const avatarUrl = loc.avatarUrl || participant?.avatar_url || null;
  const initial = escapeHtml((loc.displayName || 'R').trim().charAt(0).toUpperCase() || 'R');
  const kmh = speedToKmh(loc.speed);

  const el = rm.marker.getElement();
  el.classList.toggle('lr-rider--followed', isFollowed);
  el.classList.toggle('lr-rider--stale', isStale);
  el.style.setProperty('--rider-color', color);

  rm.bubble.innerHTML = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<span>${initial}</span>`;
  if (participant?.is_host) rm.bubble.insertAdjacentHTML('beforeend', '<i class="lr-rider__crown">👑</i>');

  rm.label.innerHTML = `<span class="lr-rider__name">${name}</span>${
    !isStale && kmh >= 5 ? `<span class="lr-rider__speed">${kmh}</span>` : ''
  }`;
}

function createRiderMarker(map: mapboxgl.Map, loc: LocationBroadcastPayload, onClick: () => void): RiderMarker {
  const el = document.createElement('div');
  el.className = 'lr-rider';
  el.innerHTML = `
    <div class="lr-rider__pin">
      <div class="lr-rider__pointer"></div>
      <div class="lr-rider__bubble"></div>
    </div>
    <div class="lr-rider__label"></div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  const marker = new mapboxgl.Marker({ element: el, anchor: 'top', offset: [0, -20] })
    .setLngLat([loc.lng, loc.lat])
    .addTo(map);

  const ringEl = document.createElement('div');
  ringEl.className = 'lr-ground';
  ringEl.innerHTML = '<div class="lr-accuracy lr-accuracy--rider"></div>';
  const ringMarker = new mapboxgl.Marker({ element: ringEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' })
    .setLngLat([loc.lng, loc.lat])
    .addTo(map);

  return {
    marker,
    ringMarker,
    ring: ringEl.firstElementChild as HTMLElement,
    pointer: el.querySelector('.lr-rider__pointer') as HTMLElement,
    label: el.querySelector('.lr-rider__label') as HTMLElement,
    bubble: el.querySelector('.lr-rider__bubble') as HTMLElement,
    renderKey: '',
    lastRingPx: -1,
    lastRotation: null,
  };
}

function ringDiameterPx(accuracy: number, lat: number, zoom: number): number {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return 0;
  return Math.min(2400, (2 * accuracy) / metersPerPixel(lat, zoom));
}

/**
 * Draws your own Google-Maps-style puck (blue dot when stopped, navigation
 * arrow when moving, accuracy halo) and every other rider's avatar marker, all
 * animated at 60 fps from the shared motion tracks.
 */
export const RiderMarkerLayer: React.FC<RiderMarkerLayerProps> = ({
  map,
  currentUserLocation,
  currentUserId,
  riderLocations,
  participants,
  followingUserId,
  onSelectRider,
}) => {
  const selfRef = useRef<SelfPuck | null>(null);
  const ridersRef = useRef<Map<string, RiderMarker>>(new Map());
  const onSelectRef = useRef(onSelectRider);
  onSelectRef.current = onSelectRider;
  /** Wall-clock time of the newest own fix, to grey the puck out when GPS goes quiet. */
  const currentUserFixAt = useRef<number>(0);

  // 1. 60 fps animation of every marker (runs before the camera in the shared frame loop)
  useEffect(() => {
    if (!map) return;

    return addFrameTask(0, (now, dt) => {
      const zoom = map.getZoom();
      const bearing = map.getBearing();

      // Own puck
      const self = selfRef.current;
      const track = liveTracks.self;
      if (self && track.initialized) {
        if (track.step(now, dt)) {
          self.ground.setLngLat([track.lng, track.lat]);
          self.dot.setLngLat([track.lng, track.lat]);
        }
        const moving = (track.speed ?? 0) > MOVING_MPS && track.heading !== null;
        if (moving !== self.lastMoving) {
          self.lastMoving = moving;
          self.arrow.style.opacity = moving ? '1' : '0';
          self.dotEl.style.opacity = moving ? '0' : '1';
        }
        self.beam.style.opacity = !moving && track.heading !== null ? '1' : '0';
        if (track.heading !== null) self.ground.setRotation(track.heading);

        const ring = ringDiameterPx(track.accuracy, track.lat, zoom);
        if (Math.abs(ring - self.lastRingPx) > 0.5) {
          self.lastRingPx = ring;
          self.ring.style.width = `${ring}px`;
          self.ring.style.height = `${ring}px`;
          self.ring.style.opacity = ring > 26 ? '1' : '0';
        }
        const stale = Date.now() - (currentUserFixAt.current || 0) > STALE_MS;
        self.dotEl.classList.toggle('lr-self-dot--stale', stale);
      }

      // Other riders
      ridersRef.current.forEach((rm, userId) => {
        const t = liveTracks.riders.get(userId);
        if (!t || !t.initialized) return;
        if (t.step(now, dt)) {
          rm.marker.setLngLat([t.lng, t.lat]);
          rm.ringMarker.setLngLat([t.lng, t.lat]);
        }
        if (t.heading !== null) {
          const rotation = t.heading - bearing;
          if (rm.lastRotation === null || Math.abs(rotation - rm.lastRotation) > 0.3) {
            rm.lastRotation = rotation;
            rm.pointer.style.transform = `rotate(${rotation}deg)`;
            rm.pointer.style.opacity = '1';
          }
        }
        const ring = t.accuracy >= RIDER_RING_MIN_ACCURACY ? ringDiameterPx(t.accuracy, t.lat, zoom) : 0;
        if (Math.abs(ring - rm.lastRingPx) > 0.5) {
          rm.lastRingPx = ring;
          rm.ring.style.width = `${ring}px`;
          rm.ring.style.height = `${ring}px`;
          rm.ring.style.opacity = ring > 40 ? '1' : '0';
        }
      });
    });
  }, [map]);

  // 2. Own position → motion track
  useEffect(() => {
    if (!map) return;
    if (!currentUserLocation) {
      if (selfRef.current) {
        selfRef.current.ground.remove();
        selfRef.current.dot.remove();
        selfRef.current = null;
      }
      return;
    }

    currentUserFixAt.current = currentUserLocation.timestamp || Date.now();
    liveTracks.self.push({
      lng: currentUserLocation.lng,
      lat: currentUserLocation.lat,
      heading: currentUserLocation.heading,
      speed: currentUserLocation.speed,
      accuracy: currentUserLocation.accuracy,
    });

    if (!selfRef.current) {
      selfRef.current = createSelfPuck(map);
      selfRef.current.ground.setLngLat([liveTracks.self.lng, liveTracks.self.lat]);
      selfRef.current.dot.setLngLat([liveTracks.self.lng, liveTracks.self.lat]);
    }
  }, [map, currentUserLocation]);

  // 3. Other riders → markers + motion tracks
  useEffect(() => {
    if (!map) return;
    const markers = ridersRef.current;

    // Collapse duplicate sessions of the same rider (rejoins) onto their newest position
    const newestByName = new Map<string, LocationBroadcastPayload>();
    Object.values(riderLocations).forEach((loc) => {
      if (!loc.userId || loc.userId === currentUserId) return;
      const key = (loc.displayName || 'Rider').trim().toLowerCase();
      const existing = newestByName.get(key);
      if (!existing || loc.timestamp > existing.timestamp) newestByName.set(key, loc);
    });
    const active = Array.from(newestByName.values());
    const activeIds = new Set(active.map((l) => l.userId));

    markers.forEach((rm, id) => {
      if (!activeIds.has(id)) {
        rm.marker.remove();
        rm.ringMarker.remove();
        markers.delete(id);
        liveTracks.riders.delete(id);
      }
    });

    active.forEach((loc) => {
      const participant = participants.find((p) => p.user_id === loc.userId);
      const isFollowed = followingUserId === loc.userId;
      const isStale = Date.now() - loc.timestamp > STALE_MS;

      let track = liveTracks.riders.get(loc.userId);
      if (!track) {
        track = new MotionTrack({ deadReckoning: true });
        liveTracks.riders.set(loc.userId, track);
      }
      track.push({ lng: loc.lng, lat: loc.lat, heading: loc.heading, speed: loc.speed, accuracy: loc.accuracy });

      let rm = markers.get(loc.userId);
      if (!rm) {
        rm = createRiderMarker(map, loc, () => onSelectRef.current?.(loc.userId));
        markers.set(loc.userId, rm);
      }

      const key = riderRenderKey(loc, participant, isFollowed, isStale);
      if (key !== rm.renderKey) {
        rm.renderKey = key;
        renderRiderContent(rm, loc, participant, isFollowed, isStale);
      }
    });
  }, [map, riderLocations, participants, currentUserId, followingUserId]);

  // Re-evaluate staleness even when no packets arrive
  useEffect(() => {
    const timer = setInterval(() => {
      ridersRef.current.forEach((rm, id) => {
        const t = liveTracks.riders.get(id);
        if (!t) return;
        const stale = performance.now() - t.lastFixAt > STALE_MS;
        rm.marker.getElement().classList.toggle('lr-rider--stale', stale);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Clean up all markers on unmount
  useEffect(() => {
    const riders = ridersRef.current;
    return () => {
      if (selfRef.current) {
        selfRef.current.ground.remove();
        selfRef.current.dot.remove();
        selfRef.current = null;
      }
      riders.forEach((rm) => {
        rm.marker.remove();
        rm.ringMarker.remove();
      });
      riders.clear();
    };
  }, []);

  return null;
};
