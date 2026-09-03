import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { GpsLocation } from '@/features/location/locationTypes';
import { LocationBroadcastPayload } from '@/types/realtime';
import { RideParticipant } from '@/types/database';
import { getRiderColor, formatSpeed } from '@/lib/utils';

interface RiderMarkerLayerProps {
  map: mapboxgl.Map | null;
  currentUserLocation: GpsLocation | null;
  currentUserId: string;
  currentDisplayName: string;
  riderLocations: Record<string, LocationBroadcastPayload>;
  participants: RideParticipant[];
  followingUserId?: string | null;
  onSelectRider?: (userId: string) => void;
}

interface MarkerKinematics {
  currentLng: number;
  currentLat: number;
  targetLng: number;
  targetLat: number;
  speed: number | null;
  heading: number | null;
  currentHeading: number | null;
  lastPacketTime: number;
}

export const RiderMarkerLayer: React.FC<RiderMarkerLayerProps> = ({
  map,
  currentUserLocation,
  currentUserId,
  currentDisplayName,
  riderLocations,
  participants,
  followingUserId,
  onSelectRider,
}) => {
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const kinematicsRef = useRef<Map<string, MarkerKinematics>>(new Map());
  const userKinematicsRef = useRef<MarkerKinematics | null>(null);

  // 1. Continuous 60fps Interpolation & Dead Reckoning Loop
  useEffect(() => {
    let animFrameId: number;

    const animate = () => {
      const now = performance.now();

      // Smoothly glide current user marker
      if (userMarkerRef.current && userKinematicsRef.current) {
        const uk = userKinematicsRef.current;
        const dLng = uk.targetLng - uk.currentLng;
        const dLat = uk.targetLat - uk.currentLat;

        if (Math.abs(dLng) > 0.0000005 || Math.abs(dLat) > 0.0000005) {
          uk.currentLng += dLng * 0.15;
          uk.currentLat += dLat * 0.15;
          userMarkerRef.current.setLngLat([uk.currentLng, uk.currentLat]);
        }

        if (uk.heading !== null && uk.currentHeading !== null) {
          let diff = ((uk.heading - uk.currentHeading + 180) % 360) - 180;
          if (diff < -180) diff += 360;
          if (Math.abs(diff) > 0.5) {
            uk.currentHeading += diff * 0.18;
            const arrow = userMarkerRef.current.getElement().querySelector('.heading-arrow') as HTMLElement | null;
            if (arrow) arrow.style.transform = `rotate(${uk.currentHeading}deg)`;
          }
        }
      }

      // Smoothly glide other riders with Dead Reckoning forward extrapolation
      markersRef.current.forEach((marker, userId) => {
        const k = kinematicsRef.current.get(userId);
        if (!k) return;

        const elapsedMs = now - k.lastPacketTime;
        let effTargetLng = k.targetLng;
        let effTargetLat = k.targetLat;

        // Dead reckoning: if packet is delayed (1.2s - 4.5s) on spotty mobile data, project along heading vector
        if (elapsedMs > 1200 && elapsedMs < 4500 && k.speed && k.speed > 1.2 && k.heading !== null) {
          const delaySec = (elapsedMs - 1200) / 1000;
          const projectedDist = Math.min(k.speed * delaySec, 65); // Cap forward projection to 65m max
          const rad = (k.heading * Math.PI) / 180;
          const projLat = (projectedDist * Math.cos(rad)) / 111320;
          const projLng = (projectedDist * Math.sin(rad)) / (111320 * Math.cos((k.targetLat * Math.PI) / 180));
          effTargetLng += projLng;
          effTargetLat += projLat;
        }

        // LERP glide towards target
        const dLng = effTargetLng - k.currentLng;
        const dLat = effTargetLat - k.currentLat;

        if (Math.abs(dLng) > 0.0000005 || Math.abs(dLat) > 0.0000005) {
          k.currentLng += dLng * 0.12;
          k.currentLat += dLat * 0.12;
          marker.setLngLat([k.currentLng, k.currentLat]);
        }

        // Smooth heading turn
        if (k.heading !== null && k.currentHeading !== null) {
          let diff = ((k.heading - k.currentHeading + 180) % 360) - 180;
          if (diff < -180) diff += 360;
          if (Math.abs(diff) > 0.5) {
            k.currentHeading += diff * 0.18;
            const arrow = marker.getElement().querySelector('.rider-heading') as HTMLElement | null;
            if (arrow) arrow.style.transform = `rotate(${k.currentHeading}deg)`;
          }
        }
      });

      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, []);

  // 2. Manage Current User's Own Marker
  useEffect(() => {
    if (!map) return;

    if (!currentUserLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      userKinematicsRef.current = null;
      return;
    }

    const { lng, lat, heading, speed } = currentUserLocation;
    const now = performance.now();

    if (!userKinematicsRef.current) {
      userKinematicsRef.current = {
        currentLng: lng,
        currentLat: lat,
        targetLng: lng,
        targetLat: lat,
        speed,
        heading,
        currentHeading: heading,
        lastPacketTime: now,
      };
    } else {
      userKinematicsRef.current.targetLng = lng;
      userKinematicsRef.current.targetLat = lat;
      userKinematicsRef.current.speed = speed;
      userKinematicsRef.current.heading = heading;
      userKinematicsRef.current.lastPacketTime = now;
    }

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'relative flex flex-col items-center cursor-pointer group';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-3 bg-brand-500/20 rounded-full animate-ping"></div>
          <div class="relative w-9 h-9 bg-brand-500 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-slate-950 font-black text-xs">
            <svg class="w-5 h-5 transition-transform duration-300 heading-arrow" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
            </svg>
          </div>
        </div>
        <div class="mt-1 px-2 py-0.5 bg-slate-900/90 text-brand-400 text-[10px] font-bold rounded-md border border-brand-500/40 shadow-lg whitespace-nowrap user-speed-label">
          You (${formatSpeed(speed)})
        </div>
      `;

      el.addEventListener('click', () => onSelectRider?.(currentUserId));

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);

      userMarkerRef.current = marker;
    } else {
      const el = userMarkerRef.current.getElement();
      const speedLabel = el.querySelector('.user-speed-label');
      if (speedLabel) {
        speedLabel.textContent = `You (${formatSpeed(speed)})`;
      }
    }
  }, [map, currentUserLocation, currentUserId, currentDisplayName, onSelectRider]);

  // 3. Manage Other Riders' Markers
  useEffect(() => {
    if (!map) return;

    const currentMarkers = markersRef.current;
    const now = performance.now();

    // Deduplicate active riders by displayName (keep newest timestamp)
    const newestRiderByDisplayName = new Map<string, LocationBroadcastPayload>();
    Object.values(riderLocations).forEach((loc) => {
      if (loc.userId === currentUserId) return;
      const key = (loc.displayName || 'Rider').trim().toLowerCase();
      const existing = newestRiderByDisplayName.get(key);
      if (!existing || loc.timestamp > existing.timestamp) {
        newestRiderByDisplayName.set(key, loc);
      }
    });

    const activeUniqueLocations = Array.from(newestRiderByDisplayName.values());
    const activeRiderIds = new Set(activeUniqueLocations.map((l) => l.userId));

    // Remove markers for riders who are no longer active
    currentMarkers.forEach((marker, riderId) => {
      if (!activeRiderIds.has(riderId) || riderId === currentUserId) {
        marker.remove();
        currentMarkers.delete(riderId);
        kinematicsRef.current.delete(riderId);
      }
    });

    // Add / Update kinematic targets for active riders
    activeUniqueLocations.forEach((loc) => {
      if (loc.userId === currentUserId) return;

      const participant = participants.find((p) => p.user_id === loc.userId);
      const isHost = participant?.is_host || false;
      const color = getRiderColor(loc.userId);
      const isStale = Date.now() - loc.timestamp > 30000;

      let marker = currentMarkers.get(loc.userId);
      const isFollowed = followingUserId === loc.userId;

      // Update kinematics target
      const k = kinematicsRef.current.get(loc.userId);
      if (!k) {
        kinematicsRef.current.set(loc.userId, {
          currentLng: loc.lng,
          currentLat: loc.lat,
          targetLng: loc.lng,
          targetLat: loc.lat,
          speed: loc.speed,
          heading: loc.heading,
          currentHeading: loc.heading,
          lastPacketTime: now,
        });
      } else {
        k.targetLng = loc.lng;
        k.targetLat = loc.lat;
        k.speed = loc.speed;
        k.heading = loc.heading;
        k.lastPacketTime = now;
      }

      if (!marker) {
        const el = document.createElement('div');
        el.className = 'relative flex flex-col items-center cursor-pointer transition-all duration-300 group';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${isFollowed ? '<div class="absolute -inset-2 bg-purple-500/40 rounded-full animate-ping"></div>' : ''}
            <div class="relative w-8 h-8 rounded-full border-2 ${isFollowed ? 'border-purple-300 ring-4 ring-purple-500/40' : 'border-white/90'} shadow-xl flex items-center justify-center text-white font-bold text-xs transition-all" style="background-color: ${color}">
              ${isHost ? '<span class="absolute -top-2.5 text-amber-400 text-xs">👑</span>' : ''}
              <svg class="w-4 h-4 transition-transform duration-300 rider-heading" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
              </svg>
            </div>
          </div>
          <div class="mt-1 px-2 py-0.5 ${isFollowed ? 'bg-purple-950/90 text-purple-200 border-purple-500/60 font-bold' : 'bg-slate-900/90 text-white border-slate-700/60 font-semibold'} text-[10px] rounded-md border shadow-lg whitespace-nowrap rider-label">
            ${isFollowed ? '🎯 ' : ''}${loc.displayName || 'Rider'}
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRider?.(loc.userId);
        });

        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);

        currentMarkers.set(loc.userId, marker);
      } else {
        const el = marker.getElement();
        el.style.opacity = isStale ? '0.5' : '1';

        const label = el.querySelector('.rider-label');
        if (label) {
          label.textContent = `${isFollowed ? '🎯 ' : ''}${loc.displayName} (${formatSpeed(loc.speed)})`;
        }
      }
    });
  }, [map, riderLocations, participants, currentUserId, followingUserId, onSelectRider]);

  // Clean up all markers on component unmount
  useEffect(() => {
    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      kinematicsRef.current.clear();
      userKinematicsRef.current = null;
    };
  }, []);

  return null;
};
