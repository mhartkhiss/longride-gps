import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm lr-anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-white/10 rounded-t-[28px] sm:rounded-3xl shadow-2xl overflow-hidden z-10 lr-anim-sheet max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <div className="sm:hidden flex justify-center pt-2.5" onClick={onClose}>
          <span className="w-10 h-1.5 rounded-full bg-slate-600/80" />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white tracking-tight truncate">{title}</h3>
            {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto overscroll-contain flex-1">{children}</div>
      </div>
    </div>
  );
};
