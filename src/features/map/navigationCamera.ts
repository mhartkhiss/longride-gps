import type { Map as MapboxMap } from 'mapbox-gl';
import { useMapStore } from '@/stores/mapStore';
import { angleDelta, clamp, interpolateStops, lerp, normalizeAngle, smoothingFactor } from '@/lib/geo';
import { liveTracks } from './liveState';
import type { MotionTrack } from './motion';

/** Google-Maps-like zoom by speed (m/s → zoom): close in on alleys, wider on highways. */
const SPEED_ZOOM: Array<[number, number]> = [
  [0, 17.6],
  [2, 17.5],
  [5, 17.1],
  [9, 16.6],
  [14, 16.1],
  [20, 15.6],
  [28, 15.0],
  [36, 14.6],
];

const MOVING_MPS = 1.5;
const TRANSITION_MS = 900;

interface Pose {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
  padTop: number;
  padBottom: number;
}

export function zoomForSpeed(speedMps: number): number {
  return interpolateStops(Math.max(0, speedMps), SPEED_ZOOM);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Per-frame follow camera. While following it owns the camera completely:
 * centre glued to the interpolated puck, heading-up rotation, tilt and
 * speed-based zoom, all smoothed so the view glides like a navigation app.
 * Any drag / rotate gesture hands control back to the rider (FREE mode).
 */
export class NavigationCamera {
  private readonly map: MapboxMap;
  private following = false;
  private targetKey: string | null = null;
  private transition: { start: number; from: Pose } | null = null;
  private zoom = 16;
  private bearing = 0;
  private pitch = 0;
  private padTop = 0;
  private padBottom = 0;
  private smoothedSpeed = 0;
  /** Zoom chosen by the rider while following another rider. */
  private riderZoom = 16;
  private userZooming = false;
  private last: Pose | null = null;

  constructor(map: MapboxMap) {
    this.map = map;
  }

  /** A pinch / wheel zoom is in progress: let the gesture own the zoom level. */
  setUserZooming(active: boolean) {
    this.userZooming = active;
    if (active || !this.following) return;
    // Remember the rider's preferred zoom as an offset on top of the speed-based zoom
    const z = this.map.getZoom();
    this.zoom = z;
    const state = useMapStore.getState();
    if (state.cameraMode === 'FOLLOW_ME') {
      state.setZoomOffset(z - zoomForSpeed(this.smoothedSpeed));
    } else {
      this.riderZoom = z;
    }
  }

  /** +/- buttons while following. */
  nudgeZoom(delta: number) {
    const state = useMapStore.getState();
    if (state.cameraMode === 'FOLLOW_ME') state.setZoomOffset(state.zoomOffset + delta);
    else this.riderZoom = clamp(this.riderZoom + delta, 3, 20);
  }

  frame(now: number, dt: number) {
    const state = useMapStore.getState();
    const mode = state.cameraMode;
    if (mode !== 'FOLLOW_ME' && mode !== 'FOLLOW_RIDER') {
      this.following = false;
      this.targetKey = null;
      return;
    }

    const key = mode === 'FOLLOW_ME' ? 'self' : `rider:${state.followingUserId}`;
    const track: MotionTrack | undefined =
      mode === 'FOLLOW_ME'
        ? liveTracks.self
        : state.followingUserId
        ? liveTracks.riders.get(state.followingUserId)
        : undefined;
    if (!track || !track.initialized) return;

    if (!this.following || key !== this.targetKey) {
      // Entering follow mode (or switching target): glide in from wherever the camera is
      const from = this.currentPose();
      this.transition = { start: now, from };
      this.zoom = from.zoom;
      this.bearing = from.bearing;
      this.pitch = from.pitch;
      this.padTop = from.padTop;
      this.padBottom = from.padBottom;
      this.riderZoom = Math.max(from.zoom, 15);
      this.smoothedSpeed = track.speed ?? 0;
      this.following = true;
      this.targetKey = key;
    }

    const { settings, uiInsets, zoomOffset } = state;
    const height = this.map.getCanvas().clientHeight || window.innerHeight;
    this.smoothedSpeed += ((track.speed ?? 0) - this.smoothedSpeed) * smoothingFactor(dt, 1500);

    let desiredZoom: number;
    let desiredBearing: number;
    let desiredPitch: number;
    let desiredTop = uiInsets.top;
    const desiredBottom = uiInsets.bottom;

    if (mode === 'FOLLOW_ME') {
      desiredZoom = clamp(zoomForSpeed(this.smoothedSpeed) + zoomOffset, 3, 20);
      const moving = this.smoothedSpeed > MOVING_MPS && track.heading !== null;
      desiredBearing = settings.headingUp ? (moving ? (track.heading as number) : this.bearing) : 0;
      desiredPitch = settings.tilt3D ? (settings.headingUp ? 58 : 45) : 0;
      if (settings.headingUp) {
        // Sit the puck low on screen so more of the road ahead is visible
        desiredTop += height * (settings.tilt3D ? 0.34 : 0.24);
      }
    } else {
      desiredZoom = this.riderZoom;
      desiredBearing = this.bearing;
      desiredPitch = this.pitch;
    }

    // Never let padding swallow the whole viewport (landscape phones)
    const maxPad = Math.max(0, height - 120);
    if (desiredTop + desiredBottom > maxPad) {
      const scale = maxPad / (desiredTop + desiredBottom);
      desiredTop *= scale;
    }

    if (this.userZooming) {
      this.zoom = this.map.getZoom();
    } else {
      this.zoom += (desiredZoom - this.zoom) * smoothingFactor(dt, 900);
    }
    this.bearing = normalizeAngle(this.bearing + angleDelta(this.bearing, desiredBearing) * smoothingFactor(dt, 450));
    this.pitch += (desiredPitch - this.pitch) * smoothingFactor(dt, 500);
    this.padTop += (desiredTop - this.padTop) * smoothingFactor(dt, 350);
    this.padBottom += (desiredBottom - this.padBottom) * smoothingFactor(dt, 350);

    let pose: Pose = {
      lng: track.lng,
      lat: track.lat,
      zoom: this.zoom,
      bearing: this.bearing,
      pitch: this.pitch,
      padTop: this.padTop,
      padBottom: this.padBottom,
    };

    if (this.transition) {
      const t = clamp((now - this.transition.start) / TRANSITION_MS, 0, 1);
      const e = easeInOutCubic(t);
      const f = this.transition.from;
      pose = {
        lng: lerp(f.lng, pose.lng, e),
        lat: lerp(f.lat, pose.lat, e),
        zoom: this.userZooming ? pose.zoom : lerp(f.zoom, pose.zoom, e),
        bearing: normalizeAngle(f.bearing + angleDelta(f.bearing, pose.bearing) * e),
        pitch: lerp(f.pitch, pose.pitch, e),
        padTop: lerp(f.padTop, pose.padTop, e),
        padBottom: lerp(f.padBottom, pose.padBottom, e),
      };
      if (t >= 1) this.transition = null;
    }

    if (this.last && isSamePose(this.last, pose)) return;
    this.last = pose;

    // Note: jumpTo treats a present-but-undefined `zoom` key as NaN, so only add it when owned
    const options: Parameters<MapboxMap['jumpTo']>[0] = {
      center: [pose.lng, pose.lat],
      bearing: pose.bearing,
      pitch: pose.pitch,
      padding: { top: pose.padTop, bottom: pose.padBottom, left: 0, right: 0 },
      retainPadding: false,
    };
    if (!this.userZooming) options.zoom = pose.zoom;
    this.map.jumpTo(options);
  }

  private currentPose(): Pose {
    const c = this.map.getCenter();
    return {
      lng: c.lng,
      lat: c.lat,
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
      padTop: 0,
      padBottom: 0,
    };
  }
}

function isSamePose(a: Pose, b: Pose): boolean {
  return (
    Math.abs(a.lng - b.lng) < 1e-8 &&
    Math.abs(a.lat - b.lat) < 1e-8 &&
    Math.abs(a.zoom - b.zoom) < 1e-4 &&
    Math.abs(angleDelta(a.bearing, b.bearing)) < 0.01 &&
    Math.abs(a.pitch - b.pitch) < 0.01 &&
    Math.abs(a.padTop - b.padTop) < 0.1 &&
    Math.abs(a.padBottom - b.padBottom) < 0.1
  );
}
