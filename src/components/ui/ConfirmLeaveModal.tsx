import React from 'react';
import { LogOut, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isHost: boolean;
  isLoading?: boolean;
}

export const ConfirmLeaveModal: React.FC<ConfirmLeaveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isHost,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm lr-anim-fade"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-sm bg-slate-900/95 border border-rose-500/30 rounded-3xl shadow-2xl shadow-rose-950/50 p-6 z-10 flex flex-col items-center text-center lr-anim-pop">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Warning Icon Pill */}
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10">
          {isHost ? <AlertTriangle className="w-6 h-6 stroke-[2.2]" /> : <LogOut className="w-6 h-6 stroke-[2.2]" />}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
          {isHost ? 'End Ride for Everyone?' : 'Leave Group Ride?'}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          {isHost
            ? 'As the host, leaving will immediately end the session for all joined riders and close the room code.'
            : 'Are you sure you want to disconnect from this live group navigation session?'}
        </p>

        {/* Actions */}
        <div className="flex flex-col w-full gap-2.5">
          <Button
            variant="danger"
            onClick={onConfirm}
            isLoading={isLoading}
            className="w-full py-2.5 font-bold shadow-lg shadow-rose-600/30 bg-rose-600 hover:bg-rose-500 active:scale-98"
          >
            <LogOut className="w-4 h-4" />
            <span>{isHost ? 'End Ride Session' : 'Leave Ride'}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="w-full py-2.5 font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white"
          >
            <span>Stay in Ride</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
