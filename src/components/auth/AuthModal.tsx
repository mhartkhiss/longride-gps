import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithOAuth } = useSessionStore();
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'facebook' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    setLoadingProvider(provider);
    try {
      await signInWithOAuth(provider);
      // Supabase OAuth redirects the browser
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to sign in with ${provider}`;
      setError(msg);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md lr-anim-fade">
      <div 
        className="relative w-full max-w-sm glass-panel bg-slate-900/95 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">Rider Account</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Sign in to use your profile picture as your live icon on the map and skip typing your name every ride.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-3 pt-1">
          {/* Google Button */}
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loadingProvider !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 active:scale-[0.98] transition-all duration-150 shadow-lg disabled:opacity-50 disabled:pointer-events-none"
          >
            {loadingProvider === 'google' ? (
              <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Facebook Button */}
          <button
            type="button"
            onClick={() => handleOAuth('facebook')}
            disabled={loadingProvider !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-[#1877F2] text-white font-semibold text-sm hover:bg-[#166fe5] active:scale-[0.98] transition-all duration-150 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loadingProvider === 'facebook' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            )}
            <span>Login with Facebook</span>
          </button>
        </div>

        {/* Footer note */}
        <p className="text-[11px] text-center text-slate-500 leading-tight">
          By continuing, your profile picture and name will be shown to fellow riders in your room.
        </p>
      </div>
    </div>
  );
};
