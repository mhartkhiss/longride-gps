import { env, hasValidMapboxConfig } from '@/lib/env';

/**
 * Place lookups tuned for barangay-level detail:
 * - reverse geocoding (Geocoding v6) → street · barangay · city
 * - place search (Search Box API) → POIs like gas stations, cafés, trailheads,
 *   with a Geocoding v5 fallback.
 */

export interface PlaceInfo {
  street: string | null;
  /** Mapbox "locality" — in the Philippines this is the barangay. */
  barangay: string | null;
  neighborhood: string | null;
  city: string | null;
  province: string | null;
  countryCode: string | null;
  /** Main line, e.g. "V. Padriga Street" or "Brgy. Lahug" when off the road network. */
  title: string;
  /** Second line, e.g. "Brgy. Lahug, Cebu City". */
  subtitle: string;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  detail: string;
  featureType: string;
  distanceMeters: number | null;
  category: string | null;
  /** Known up-front for fallback results; Search Box results need `retrieve`. */
  lng?: number;
  lat?: number;
  source: 'searchbox' | 'geocoding';
}

interface ContextEntry {
  name?: string;
  country_code?: string;
}

/** Adds the familiar "Brgy." prefix for Philippine barangays. */
export function formatBarangay(name: string | null, countryCode: string | null): string | null {
  if (!name) return null;
  if (countryCode !== 'ph') return name;
  return /^(barangay|brgy\.?)\s/i.test(name) ? name : `Brgy. ${name}`;
}

export function placeLabel(place: PlaceInfo | null): string {
  if (!place) return 'Dropped pin';
  return place.street || formatBarangay(place.barangay, place.countryCode) || place.city || 'Dropped pin';
}

const reverseCache = new Map<string, PlaceInfo | null>();
const REVERSE_CACHE_LIMIT = 200;

export async function reverseGeocode(lng: number, lat: number, signal?: AbortSignal): Promise<PlaceInfo | null> {
  if (!hasValidMapboxConfig) return null;
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    language: 'en',
    access_token: env.mapboxToken,
  });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params}`, { signal });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const data = await res.json();
  const first = data.features?.[0];
  const ctx = (first?.properties?.context || {}) as Record<string, ContextEntry>;

  const countryCode = ctx.country?.country_code?.toLowerCase() ?? null;
  const street = ctx.street?.name ?? null;
  const barangay = ctx.locality?.name ?? null;
  const neighborhood = ctx.neighborhood?.name ?? null;
  const city = ctx.place?.name ?? null;
  const province = ctx.region?.name ?? null;
  const brgyLabel = formatBarangay(barangay, countryCode);

  let place: PlaceInfo | null = null;
  if (first) {
    const title = street || neighborhood || brgyLabel || city || first.properties?.name || 'Unknown area';
    const subtitleParts = [
      title !== neighborhood ? neighborhood : null,
      title !== brgyLabel ? brgyLabel : null,
      title !== city ? city : province,
    ].filter((v): v is string => !!v);
    place = {
      street,
      barangay,
      neighborhood,
      city,
      province,
      countryCode,
      title,
      subtitle: subtitleParts.join(', '),
    };
  }

  if (reverseCache.size >= REVERSE_CACHE_LIMIT) {
    const oldest = reverseCache.keys().next().value;
    if (oldest !== undefined) reverseCache.delete(oldest);
  }
  reverseCache.set(key, place);
  return place;
}

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface SearchOptions {
  lng?: number;
  lat?: number;
  countryCode?: string | null;
}

/**
 * One search session (open the search sheet → pick a result). Search Box bills
 * per session, so every keystroke inside a session costs nothing extra.
 */
export class PlaceSearchSession {
  private token = newSessionToken();
  private useFallback = false;

  async suggest(query: string, opts: SearchOptions, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
    const q = query.trim();
    if (q.length < 2 || !hasValidMapboxConfig) return [];
    if (!this.useFallback) {
      try {
        return await this.searchBoxSuggest(q, opts, signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        console.warn('Search Box unavailable, falling back to geocoding:', err);
        this.useFallback = true;
      }
    }
    return this.geocodingSearch(q, opts, signal);
  }

  async retrieve(s: PlaceSuggestion): Promise<{ lng: number; lat: number; name: string } | null> {
    if (s.lng !== undefined && s.lat !== undefined) return { lng: s.lng, lat: s.lat, name: s.name };
    const params = new URLSearchParams({ session_token: this.token, access_token: env.mapboxToken });
    const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.id)}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    const coords = f?.geometry?.coordinates as [number, number] | undefined;
    if (!coords) return null;
    // A session ends with a retrieve; start a new one for the next search
    this.token = newSessionToken();
    return { lng: coords[0], lat: coords[1], name: f.properties?.name || s.name };
  }

  private async searchBoxSuggest(q: string, opts: SearchOptions, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({
      q,
      session_token: this.token,
      language: 'en',
      limit: '8',
      access_token: env.mapboxToken,
    });
    if (opts.lng !== undefined && opts.lat !== undefined) {
      params.set('proximity', `${opts.lng},${opts.lat}`);
      params.set('origin', `${opts.lng},${opts.lat}`);
    }
    if (opts.countryCode) params.set('country', opts.countryCode);

    const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`, { signal });
    if (!res.ok) throw new Error(`Search Box responded ${res.status}`);
    const data = await res.json();
    // Brand / category suggestions are search shortcuts without a location — skip them
    const placeLike = (data.suggestions || []).filter(
      (s: { feature_type?: string }) => !['brand', 'category', 'query'].includes(s.feature_type || '')
    );
    return placeLike.map(
      (s: {
        mapbox_id: string;
        name: string;
        full_address?: string;
        place_formatted?: string;
        feature_type?: string;
        distance?: number;
        poi_category?: string[];
      }): PlaceSuggestion => ({
        id: s.mapbox_id,
        name: s.name,
        detail: s.place_formatted || s.full_address || '',
        featureType: s.feature_type || 'place',
        distanceMeters: typeof s.distance === 'number' ? s.distance : null,
        category: s.poi_category?.[0] ?? null,
        source: 'searchbox',
      })
    );
  }

  private async geocodingSearch(q: string, opts: SearchOptions, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({
      access_token: env.mapboxToken,
      limit: '8',
      language: 'en',
      fuzzyMatch: 'true',
      types: 'poi,address,locality,neighborhood,place,district,postcode',
    });
    if (opts.lng !== undefined && opts.lat !== undefined) params.set('proximity', `${opts.lng},${opts.lat}`);
    if (opts.countryCode) params.set('country', opts.countryCode);

    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(
      (f: { id: string; text: string; place_name: string; place_type: string[]; center: [number, number] }) => ({
        id: f.id,
        name: f.text,
        detail: f.place_name.split(',').slice(1).join(',').trim(),
        featureType: f.place_type?.[0] || 'place',
        distanceMeters: null,
        category: null,
        lng: f.center[0],
        lat: f.center[1],
        source: 'geocoding' as const,
      })
    );
  }
}
