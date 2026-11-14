import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { bearingDegrees, distanceMeters } from './geo';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula (in meters)
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return distanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Calculates bearing from start point to destination point in degrees (0..360)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return bearingDegrees(lat1, lon1, lat2, lon2);
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) {
    // Round to 10 m above 100 m so the value doesn't flicker while riding
    const rounded = meters < 100 ? Math.round(meters) : Math.round(meters / 10) * 10;
    return `${rounded} m`;
  }
  return meters < 10000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

/** Wall-clock arrival time, e.g. "3:45 PM". */
export function formatArrivalTime(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function speedToKmh(metersPerSecond: number | null | undefined): number {
  if (metersPerSecond === null || metersPerSecond === undefined || !Number.isFinite(metersPerSecond) || metersPerSecond < 0) {
    return 0;
  }
  return Math.round(metersPerSecond * 3.6);
}

export function formatSpeed(metersPerSecond: number | null): string {
  return `${speedToKmh(metersPerSecond)} km/h`;
}

/** Compact "last seen" text: "now", "45s", "3m", "2h". */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function haptic(pattern: number | number[] = 30): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration is best-effort only
  }
}

const AVATAR_COLORS = [
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#F97316', // orange
  '#14B8A6', // teal
];

export function getRiderColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/** Escapes text for safe interpolation into marker innerHTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
