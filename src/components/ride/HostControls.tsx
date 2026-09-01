import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MapPin, UserPlus } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { RideService } from '@/features/rides/rideService';
import { DestinationSearchModal } from './DestinationSearchModal';
import { ShareCodeModal } from './ShareCodeModal';
import { Destination } from '@/types/database';
import { useMapStore } from '@/stores/mapStore';
import { RideRealtimeChannel } from '@/features/realtime/rideChannel';

interface HostControlsProps {
  realtimeChannel?: RideRealtimeChannel | null;
}

export const HostControls: React.FC<HostControlsProps> = ({ realtimeChannel }) => {
  const { currentRide, destination, isHost, setDestination, setRide } = useRideStore();
  const { userLocation } = useMapStore();

  const [isDestModalOpen, setIsDestModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  if (!currentRide || !isHost) return null;

  const handleSelectDestination = async (newDest: Destination) => {
    try {
      const updatedRide = await RideService.updateDestination(currentRide.id, newDest);
      setDestination(newDest);
      setRide(updatedRide);

      // Broadcast destination update
      if (realtimeChannel) {
        await realtimeChannel.broadcastRouteUpdated({
          routeVersion: updatedRide.route_version,
          destinationLat: newDest.lat,
          destinationLng: newDest.lng,
          destinationName: newDest.name,
          vehicleMode: updatedRide.vehicle_mode,
          updatedBy: currentRide.host_user_id,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('Failed to update destination:', err);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 pointer-events-auto">
        {/* Set / Change Destination */}
        <Button
          size="sm"
          variant="glass"
          onClick={() => setIsDestModalOpen(true)}
          className="border-brand-500/40 text-brand-300 hover:text-white px-2.5 py-1.5 sm:px-3 shadow-lg"
          title={destination ? 'Change Destination' : 'Set Destination'}
        >
          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="hidden md:inline">
            {destination ? 'Change Destination' : 'Set Destination'}
          </span>
          <span className="md:hidden text-[11px]">Dest</span>
        </Button>

        {/* Invite Code */}
        <Button
          size="sm"
          variant="glass"
          onClick={() => setIsShareModalOpen(true)}
          className="px-2.5 py-1.5 sm:px-3 shadow-lg"
          title="Share Invite Code"
        >
          <UserPlus className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span className="hidden sm:inline">Invite</span>
        </Button>
      </div>

      {/* Destination Modal */}
      <DestinationSearchModal
        isOpen={isDestModalOpen}
        onClose={() => setIsDestModalOpen(false)}
        onSelectDestination={handleSelectDestination}
        currentDestination={destination}
        userLng={userLocation?.lng}
        userLat={userLocation?.lat}
      />

      {/* Share Modal */}
      <ShareCodeModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomCode={currentRide.room_code}
        rideName={currentRide.name}
      />
    </>
  );
};
