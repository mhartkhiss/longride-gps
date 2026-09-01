import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Copy, Check, Share2 } from 'lucide-react';

interface ShareCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  rideName: string;
}

export const ShareCodeModal: React.FC<ShareCodeModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  rideName,
}) => {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/join?code=${roomCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${rideName} on LongRide GPS`,
          text: `Join our group ride session using code: ${roomCode}`,
          url: shareUrl,
        });
      } catch {
        // Ignored or cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Riders"
      description="Share this code or link with riders to join the live session."
    >
      <div className="space-y-6 text-center">
        {/* Room Code Display */}
        <div className="bg-slate-950/80 border border-brand-500/30 rounded-2xl p-6 shadow-inner">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Ride Room Code
          </p>
          <div className="text-4xl sm:text-5xl font-extrabold tracking-widest text-brand-400 font-mono select-all">
            {roomCode}
          </div>
        </div>

        {/* Share Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleCopy}
            variant="secondary"
            className="flex-1"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-brand-400" />
                <span className="text-brand-400">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Invite Link</span>
              </>
            )}
          </Button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              onClick={handleNativeShare}
              variant="primary"
              className="flex-1"
            >
              <Share2 className="w-4 h-4" />
              <span>Share via App</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
