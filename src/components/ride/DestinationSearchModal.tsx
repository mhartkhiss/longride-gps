import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search, MapPin, Loader2, Navigation } from 'lucide-react';
import { MapboxDirectionsService } from '@/features/routing/mapboxDirections';
import { Destination } from '@/types/database';

interface DestinationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => Promise<void>;
  currentDestination: Destination | null;
  userLng?: number;
  userLat?: number;
}

export const DestinationSearchModal: React.FC<DestinationSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectDestination,
  currentDestination,
  userLng,
  userLat,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; lng: number; lat: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const places = await MapboxDirectionsService.searchPlaces(query, userLng, userLat);
        setResults(places);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, userLng, userLat]);

  const handleSelect = async (place: { name: string; lng: number; lat: number }) => {
    setIsSubmitting(true);
    try {
      await onSelectDestination({
        name: place.name.split(',')[0], // Short place name
        lng: place.lng,
        lat: place.lat,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set Shared Destination"
      description="Choose a destination for all riders in this session."
    >
      <div className="space-y-4">
        <Input
          leftIcon={<Search className="w-4 h-4" />}
          placeholder="Search place, city, or address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {/* Current Destination Display */}
        {currentDestination && !query && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Current Destination</p>
                <p className="text-sm font-semibold text-white">{currentDestination.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Search Results List */}
        <div className="max-h-64 overflow-y-auto space-y-1.5 pt-1">
          {isSearching && (
            <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              <span>Searching locations...</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            results.map((place) => (
              <button
                key={place.id}
                onClick={() => handleSelect(place)}
                disabled={isSubmitting}
                className="w-full text-left p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-transparent hover:border-brand-500/40 transition-all flex items-start gap-3 group"
              >
                <Navigation className="w-4 h-4 text-slate-400 group-hover:text-brand-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-brand-300 truncate">
                    {place.name.split(',')[0]}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {place.name.split(',').slice(1).join(',').trim()}
                  </p>
                </div>
              </button>
            ))
          )}

          {!isSearching && query.length >= 2 && results.length === 0 && (
            <div className="py-6 text-center text-slate-400 text-xs">
              No matching locations found.
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};
