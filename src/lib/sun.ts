/**
 * Sunrise / sunset from the standard sunrise equation (±2 min accuracy),
 * used to switch the map between day, dusk, night and dawn automatically.
 */

export type LightPreset = 'day' | 'dusk' | 'night' | 'dawn';

const DEG = Math.PI / 180;
const J1970 = 2440587.5;
const J2000 = 2451545.0;
const DAY_MS = 86400000;

function toJulian(ms: number) {
  return ms / DAY_MS + J1970;
}

function fromJulian(j: number) {
  return (j - J1970) * DAY_MS;
}

/** Returns sunrise/sunset (epoch ms) for the solar day nearest `ms`, or null during polar day/night. */
function sunTimes(ms: number, lat: number, lng: number): { rise: number; set: number } | null {
  const n = Math.round(toJulian(ms) - J2000 - 0.0009 + lng / 360);
  const jStar = n + 0.0009 - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const Mr = M * DEG;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = ((M + C + 180 + 102.9372) % 360) * DEG;
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lambda);
  const sinDec = Math.sin(lambda) * Math.sin(23.4397 * DEG);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosOmega = (Math.sin(-0.833 * DEG) - Math.sin(lat * DEG) * sinDec) / (Math.cos(lat * DEG) * cosDec);
  if (cosOmega < -1 || cosOmega > 1) return null;
  const omega = Math.acos(cosOmega) / DEG;
  return {
    rise: fromJulian(jTransit - omega / 360),
    set: fromJulian(jTransit + omega / 360),
  };
}

const DAWN_BEFORE_MS = 30 * 60 * 1000;
const DAWN_AFTER_MS = 20 * 60 * 1000;
const DUSK_BEFORE_MS = 25 * 60 * 1000;
const DUSK_AFTER_MS = 30 * 60 * 1000;

/** Picks the Mapbox Standard light preset for the current sky at a location. */
export function lightPresetFor(now: number, lat: number | null, lng: number | null): LightPreset {
  if (lat === null || lng === null) return lightPresetByClock(new Date(now));

  const events: Array<{ type: 'rise' | 'set'; t: number }> = [];
  for (const offset of [-1, 0, 1]) {
    const times = sunTimes(now + offset * DAY_MS, lat, lng);
    if (!times) return lightPresetByClock(new Date(now));
    events.push({ type: 'rise', t: times.rise }, { type: 'set', t: times.set });
  }
  events.sort((a, b) => a.t - b.t);

  for (const e of events) {
    if (e.type === 'rise' && now >= e.t - DAWN_BEFORE_MS && now < e.t + DAWN_AFTER_MS) return 'dawn';
    if (e.type === 'set' && now >= e.t - DUSK_BEFORE_MS && now < e.t + DUSK_AFTER_MS) return 'dusk';
  }

  const previous = [...events].reverse().find((e) => e.t <= now);
  return previous?.type === 'rise' ? 'day' : 'night';
}

/** Fallback when no location is known yet (tuned for tropical latitudes). */
export function lightPresetByClock(date: Date): LightPreset {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 5 * 60 + 20 && minutes < 6 * 60) return 'dawn';
  if (minutes >= 6 * 60 && minutes < 17 * 60 + 30) return 'day';
  if (minutes >= 17 * 60 + 30 && minutes < 18 * 60 + 20) return 'dusk';
  return 'night';
}

export function isDarkPreset(preset: LightPreset): boolean {
  return preset === 'night' || preset === 'dusk';
}
