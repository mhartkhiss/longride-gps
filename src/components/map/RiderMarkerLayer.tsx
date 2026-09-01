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

  // 1. Manage Current User's Own Marker
  useEffect(() => {
    if (!map) return;

    if (!currentUserLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const { lng, lat, heading, speed } = currentUserLocation;

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
        <div class="mt-1 px-2 py-0.5 bg-slate-900/90 text-brand-400 text-[10px] font-bold rounded-md border border-brand-500/40 shadow-lg whitespace-nowrap">
          You (${formatSpeed(speed)})
        </div>
      `;

      el.addEventListener('click', () => onSelectRider?.(currentUserId));

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);

      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLngLat([lng, lat]);
      const el = userMarkerRef.current.getElement();
      const arrow = el.querySelector('.heading-arrow') as HTMLElement | null;
      if (arrow && heading !== null) {
        arrow.style.transform = `rotate(${heading}deg)`;
      }
    }
  }, [map, currentUserLocation, currentUserId, currentDisplayName, onSelectRider]);

  // 2. Manage Other Riders' Markers
  useEffect(() => {
    if (!map) return;

    const currentMarkers = markersRef.current;

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
      }
    });

    // Add / Update markers for active riders
    activeUniqueLocations.forEach((loc) => {
      if (loc.userId === currentUserId) return;

      const participant = participants.find((p) => p.user_id === loc.userId);
      const isHost = participant?.is_host || false;
      const color = getRiderColor(loc.userId);
      const isStale = Date.now() - loc.timestamp > 30000;

      let marker = currentMarkers.get(loc.userId);

      const isFollowed = followingUserId === loc.userId;

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
        marker.setLngLat([loc.lng, loc.lat]);
        const el = marker.getElement();
        el.style.opacity = isStale ? '0.5' : '1';

        const arrow = el.querySelector('.rider-heading') as HTMLElement | null;
        if (arrow && loc.heading !== null) {
          arrow.style.transform = `rotate(${loc.heading}deg)`;
        }

        const label = el.querySelector('.rider-label');
        if (label) {
          label.textContent = `${isFollowed ? '🎯 ' : ''}${loc.displayName} (${formatSpeed(loc.speed)})`;
        }
      }
    });

    return () => {
      // Cleanup when unmounting
    };
  }, [map, riderLocations, participants, currentUserId, onSelectRider]);

  // Clean up all markers on component unmount
  useEffect(() => {
    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
  }, []);

  return null;
};
