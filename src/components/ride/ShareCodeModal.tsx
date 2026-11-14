import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { haptic } from '@/lib/utils';

interface ShareCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  rideName: string;
}

export const ShareCodeModal: React.FC<ShareCodeModalProps> = ({ isOpen, onClose, roomCode, rideName }) => {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const shareUrl = `${window.location.origin}/join?code=${roomCode}`;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? roomCode : shareUrl);
      haptic(25);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked — the code stays selectable on screen
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `Join ${rideName} on LongRide GPS`,
        text: `Join our group ride "${rideName}" with code ${roomCode}`,
        url: shareUrl,
      });
    } catch {
      // Cancelled
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite riders" description="Share the code or link — no sign-up needed">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => copy('code')}
          className="w-full rounded-3xl bg-slate-950/80 border border-brand-500/30 p-5 text-center shadow-inner active:scale-[0.99] transition-transform"
        >
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Room code</p>
          <div className="flex justify-center gap-1.5">
            {roomCode.split('').map((ch, i) => (
              <span
                key={i}
                className="w-10 h-12 sm:w-11 sm:h-14 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-2xl sm:text-3xl font-black font-mono text-brand-300"
              >
                {ch}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 flex items-center justify-center gap-1.5">
            {copied === 'code' ? (
              <>
                <Check className="w-3.5 h-3.5 text-brand-400" /> Code copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Tap to copy code
              </>
            )}
          </p>
        </button>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={() => copy('link')}
            className="flex-1 h-12 rounded-2xl bg-slate-800/90 border border-white/10 text-sm font-bold text-slate-100 flex items-center justify-center gap-2"
          >
            {copied === 'link' ? <Check className="w-4 h-4 text-brand-400" /> : <Link2 className="w-4 h-4" />}
            {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex-1 h-12 rounded-2xl bg-brand-500 text-slate-950 text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20"
            >
              <Share2 className="w-4 h-4" />
              Share via app
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
