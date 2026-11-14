import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, X } from 'lucide-react';
import { RideMap } from '@/components/map/RideMap';
import { useMapStore } from '@/stores/mapStore';
import { useRideStore } from '@/stores/rideStore';
import { getActiveMap } from '@/features/map/liveState';
import { useRouteNavigation } from '@/features/routing/useRouteNavigation';
import { useBarangayTracking, useRoadNameTracking } from '@/features/geocoding/placeTracking';
import { Destination } from '@/types/database';
import { ChatMessagePayload } from '@/types/realtime';
import { haptic } from '@/lib/utils';
import { RideTopBar } from './RideTopBar';
import { NavBanner } from './NavBanner';
import { RideSheet } from './RideSheet';
import { RiderDetailCard } from './RiderDetailCard';
import { PickDestinationPanel } from './PickDestinationPanel';
import { DestinationSearchModal } from './DestinationSearchModal';
import { ShareCodeModal } from './ShareCodeModal';
import { ChatModal } from './ChatModal';
import { ConfirmLeaveModal } from '@/components/ui/ConfirmLeaveModal';

export interface RideViewProps {
  chatMessages: ChatMessagePayload[];
  unreadCount: number;
  isChatOpen: boolean;
  onOpenChat: () => void;
  onCloseChat: () => void;
  onSendChatMessage: (text: string, isQuickAlert?: boolean) => void;
  /** Host only: share a new destination with the ride (null clears it). */
  onSetDestination: (destination: Destination | null) => Promise<void>;
  onConfirmLeave: () => void;
  isLeaving: boolean;
  permissionError: string | null;
}

/**
 * The live ride screen: full-screen navigation map with floating controls,
 * turn banner, GTA-style location readout and the ride bottom sheet.
 */
export const RideView: React.FC<RideViewProps> = ({
  chatMessages,
  unreadCount,
  isChatOpen,
  onOpenChat,
  onCloseChat,
  onSendChatMessage,
  onSetDestination,
  onConfirmLeave,
  isLeaving,
  permissionError,
}) => {
  const currentRide = useRideStore((s) => s.currentRide);
  const destination = useRideStore((s) => s.destination);
  const isHost = useRideStore((s) => s.isHost);
  const followingUserId = useMapStore((s) => s.followingUserId);
  const selectedUserId = useMapStore((s) => s.selectedUserId);
  const cameraMode = useMapStore((s) => s.cameraMode);
  const riderLocations = useMapStore((s) => s.riderLocations);
  const pickState = useMapStore((s) => s.pickState);
  const uiInsetsTop = useMapStore((s) => s.uiInsets.top);
  const setUiInsets = useMapStore((s) => s.setUiInsets);
  const setCameraMode = useMapStore((s) => s.setCameraMode);
  const clearFollowing = useMapStore((s) => s.clearFollowing);
  const setPickState = useMapStore((s) => s.setPickState);

  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useRouteNavigation();
  useBarangayTracking();
  useRoadNameTracking();

  // The camera keeps the puck clear of the floating top UI
  const reportTopInset = useCallback(() => {
    const el = topRef.current;
    if (el) setUiInsets({ top: Math.round(el.getBoundingClientRect().bottom) });
  }, [setUiInsets]);
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new ResizeObserver(reportTopInset);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reportTopInset]);
  // Also re-measure after renders that may add or remove a banner (cheap: one layout read)
  useLayoutEffect(reportTopInset);

  const handleFocusRider = useCallback(
    (lng: number, lat: number) => {
      const map = getActiveMap();
      if (!map) return;
      setCameraMode('FREE');
      const { top, bottom } = useMapStore.getState().uiInsets;
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 16.5),
        padding: { top, bottom, left: 0, right: 0 },
        retainPadding: false,
        duration: 900,
      });
    },
    [setCameraMode]
  );

  const handlePickOnMap = () => {
    setIsDestinationOpen(false);
    setPickState({});
  };

  const followedName = followingUserId ? riderLocations[followingUserId]?.displayName || 'Rider' : null;

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-slate-950">
      <main className="absolute inset-0">
        <RideMap canPickDestination={isHost} />
      </main>

      {/* ── Top chrome (measured) ── */}
      <div
        ref={topRef}
        className="absolute top-0 left-0 right-0 sm:right-auto sm:w-[440px] z-30 pointer-events-none px-3 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] pl-[max(0.75rem,env(safe-area-inset-left,0.75rem))] pr-[max(0.75rem,env(safe-area-inset-right,0.75rem))] pb-1 space-y-2"
      >
        <RideTopBar unreadCount={unreadCount} onOpenChat={onOpenChat} />

        {!pickState && <NavBanner />}

        {permissionError && (
          <div className="pointer-events-auto glass-panel border-rose-500/50 bg-rose-950/80 p-3 rounded-2xl text-xs text-rose-100 flex items-start gap-2.5 lr-anim-drop">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <span>{permissionError}</span>
          </div>
        )}

        {followedName && !selectedUserId && !pickState && (
          <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full bg-purple-950/90 border border-purple-500/50 pl-3 pr-1 py-1 shadow-xl backdrop-blur-md lr-anim-drop">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
            </span>
            <span className="text-xs font-bold text-purple-100 truncate">Following {followedName}</span>
            {cameraMode !== 'FOLLOW_RIDER' && (
              <button
                type="button"
                onClick={() => {
                  haptic(20);
                  setCameraMode('FOLLOW_RIDER');
                }}
                className="h-8 px-2.5 rounded-full bg-purple-700/80 text-[11px] font-bold text-white flex items-center gap-1 shrink-0"
              >
                <Eye className="w-3.5 h-3.5" /> Show
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                haptic(20);
                clearFollowing();
              }}
              aria-label="Stop following"
              className="h-8 px-2.5 rounded-full bg-purple-800/90 text-[11px] font-bold text-white flex items-center gap-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        )}
      </div>

      {/* ── Rider card (below the top chrome) ── */}
      <div
        className="absolute left-0 right-0 sm:right-auto sm:w-[400px] z-40 px-3 pointer-events-none"
        style={{ top: uiInsetsTop + 4 }}
      >
        {!pickState && <RiderDetailCard onFocusRider={handleFocusRider} />}
      </div>

      {/* ── Bottom sheet / destination picker ── */}
      <div className="absolute bottom-0 left-0 right-0 sm:left-3 sm:bottom-3 sm:right-auto sm:w-[400px] z-30 pointer-events-none pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        {pickState ? (
          <PickDestinationPanel onConfirm={onSetDestination} />
        ) : (
          <RideSheet
            onLeaveRide={() => setIsLeaveOpen(true)}
            onFocusRider={handleFocusRider}
            onOpenDestination={() => setIsDestinationOpen(true)}
            onClearDestination={() => onSetDestination(null)}
            onInvite={() => setIsShareOpen(true)}
          />
        )}
      </div>

      {isHost && (
        <DestinationSearchModal
          isOpen={isDestinationOpen}
          onClose={() => setIsDestinationOpen(false)}
          onSelectDestination={onSetDestination}
          onPickOnMap={handlePickOnMap}
          onClearDestination={destination ? () => onSetDestination(null) : undefined}
          currentDestination={destination}
        />
      )}

      {currentRide && (
        <ShareCodeModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          roomCode={currentRide.room_code}
          rideName={currentRide.name}
        />
      )}

      <ChatModal
        isOpen={isChatOpen}
        onClose={onCloseChat}
        rideName={currentRide?.name}
        messages={chatMessages}
        onSendMessage={onSendChatMessage}
      />

      <ConfirmLeaveModal
        isOpen={isLeaveOpen}
        onClose={() => setIsLeaveOpen(false)}
        onConfirm={onConfirmLeave}
        isHost={isHost}
        isLoading={isLeaving}
      />
    </div>
  );
};
