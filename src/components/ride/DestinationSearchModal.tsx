import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Coffee,
  Crosshair,
  Flag,
  Fuel,
  Loader2,
  MapPin,
  Route,
  Search,
  Store,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Destination } from '@/types/database';
import { useMapStore } from '@/stores/mapStore';
import { usePlaceStore } from '@/features/geocoding/placeTracking';
import { PlaceSearchSession, PlaceSuggestion } from '@/features/geocoding/geocoding';
import { cn, formatDistance, haptic } from '@/lib/utils';

interface DestinationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => Promise<void>;
  /** Close the sheet and choose the spot by moving the map under a crosshair. */
  onPickOnMap: () => void;
  onClearDestination?: () => void;
  currentDestination: Destination | null;
}

function iconFor(s: PlaceSuggestion): LucideIcon {
  const category = (s.category || '').toLowerCase();
  if (/(gas|fuel|petrol)/.test(category)) return Fuel;
  if (/(cafe|coffee)/.test(category)) return Coffee;
  if (/(restaurant|food|fast)/.test(category)) return Utensils;
  if (/(shop|store|mall|market)/.test(category)) return Store;
  switch (s.featureType) {
    case 'address':
      return Building2;
    case 'street':
      return Route;
    case 'locality':
    case 'neighborhood':
    case 'place':
    case 'district':
      return Users;
    default:
      return MapPin;
  }
}

function typeLabel(s: PlaceSuggestion, countryCode: string | null): string | null {
  if (s.featureType === 'locality') return countryCode === 'ph' ? 'Barangay' : 'Area';
  if (s.featureType === 'neighborhood') return 'Neighborhood';
  if (s.featureType === 'place') return 'City / town';
  return null;
}

export const DestinationSearchModal: React.FC<DestinationSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectDestination,
  onPickOnMap,
  onClearDestination,
  currentDestination,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PlaceSearchSession | null>(null);

  const countryCode = usePlaceStore((s) => s.place?.countryCode ?? null);

  // Fresh search session each time the sheet opens
  useEffect(() => {
    if (isOpen) {
      sessionRef.current = new PlaceSearchSession();
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [isOpen]);

  // Debounced search, biased towards where the rider is
  useEffect(() => {
    const q = query.trim();
    if (!isOpen || q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const loc = useMapStore.getState().userLocation;
      try {
        const found = await sessionRef.current!.suggest(
          q,
          { lng: loc?.lng, lat: loc?.lat, countryCode },
          controller.signal
        );
        setResults(found);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Search is unavailable right now.');
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, isOpen, countryCode]);

  const handleSelect = async (s: PlaceSuggestion) => {
    if (submittingId) return;
    setSubmittingId(s.id);
    setError(null);
    try {
      const place = await sessionRef.current!.retrieve(s);
      if (!place) throw new Error('Could not load that place');
      haptic(30);
      await onSelectDestination({ name: place.name, lng: place.lng, lat: place.lat });
      onClose();
    } catch {
      setError('Could not set that destination. Try again.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Where to?" description="Everyone in the ride gets the route">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gas station, café, barangay, address…"
            enterKeyHint="search"
            className="w-full h-12 bg-slate-950/80 border border-slate-700/80 text-white rounded-2xl pl-11 pr-11 text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/80"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!query && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                haptic(20);
                onPickOnMap();
              }}
              className="w-full min-h-[56px] rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-white/5 px-3 flex items-center gap-3 text-left transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-300 shrink-0">
                <Crosshair className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">Pick a spot on the map</span>
                <span className="block text-xs text-slate-400">For trailheads, inner alleys and places search can't find</span>
              </span>
            </button>

            {currentDestination && (
              <div className="rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 flex items-center gap-3">
                <Flag className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Current destination</p>
                  <p className="text-sm font-semibold text-white truncate">{currentDestination.name}</p>
                </div>
                {onClearDestination && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearDestination();
                      onClose();
                    }}
                    className="h-9 px-3 rounded-xl bg-slate-800 text-xs font-bold text-rose-300 shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-500 px-1">Tip: long-press anywhere on the map to drop a pin.</p>
          </div>
        )}

        {error && <p className="text-xs text-rose-300 px-1">{error}</p>}

        {query.trim().length >= 2 && (
          <div className="space-y-1.5 min-h-[120px]">
            {isSearching && results.length === 0 && (
              <div className="py-8 flex flex-col items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                Searching nearby…
              </div>
            )}

            {results.map((s) => {
              const Icon = iconFor(s);
              const label = typeLabel(s, countryCode);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s)}
                  disabled={!!submittingId}
                  className={cn(
                    'w-full min-h-[56px] text-left px-3 py-2.5 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 border border-transparent hover:border-brand-500/40 transition-all flex items-center gap-3',
                    submittingId && submittingId !== s.id && 'opacity-50'
                  )}
                >
                  <span className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                    {submittingId === s.id ? <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> : <Icon className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">{s.name}</span>
                    <span className="block text-xs text-slate-400 truncate">
                      {label && <span className="text-brand-300/90 font-semibold">{label} · </span>}
                      {s.detail}
                    </span>
                  </span>
                  {s.distanceMeters !== null && (
                    <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0">{formatDistance(s.distanceMeters)}</span>
                  )}
                </button>
              );
            })}

            {!isSearching && results.length === 0 && !error && (
              <div className="py-6 text-center text-slate-400 text-xs space-y-1">
                <p>No matches nearby.</p>
                <button type="button" onClick={onPickOnMap} className="text-brand-300 font-semibold">
                  Pick the spot on the map instead
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
