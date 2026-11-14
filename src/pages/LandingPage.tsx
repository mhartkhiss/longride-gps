import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Compass, Footprints, LogIn, LogOut, Navigation2, Users } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';
import { AuthModal } from '@/components/auth/AuthModal';

const FEATURES = [
  {
    icon: Footprints,
    tint: 'bg-amber-500/20 text-amber-300',
    title: 'Every alley & trail',
    body: 'Precise GPS that never snaps to roads, with footpaths, dirt tracks and satellite view for the places maps forget.',
  },
  {
    icon: Navigation2,
    tint: 'bg-sky-500/20 text-sky-300',
    title: 'Navigation view',
    body: 'Heading-up 3D camera that follows you like GTA or Google Maps, with turn-by-turn directions to the meet-up.',
  },
  {
    icon: Users,
    tint: 'bg-brand-500/20 text-brand-300',
    title: 'The whole pack, live',
    body: 'See every rider move in real time, follow anyone, and drop quick shouts — no account needed.',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { initSession, isInitialized, isAuthenticated, displayName, avatarUrl, signOut } = useSessionStore();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    const checkActiveRide = async () => {
      const savedRideId = localStorage.getItem('longride_active_ride_id');
      if (savedRideId) {
        try {
          const ride = await RideService.getRideById(savedRideId);
          if (ride && ride.status !== 'ended') {
            navigate(`/ride/${savedRideId}`, { replace: true });
            return;
          } else {
            localStorage.removeItem('longride_active_ride_id');
          }
        } catch {
          localStorage.removeItem('longride_active_ride_id');
        }
      }

      if (!isInitialized) {
        initSession();
      }
    };

    checkActiveRide();
  }, [navigate, initSession, isInitialized]);

  const cleanCode = code.trim().toUpperCase();
  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (cleanCode.length < 4) return;
    navigate(`/join?code=${encodeURIComponent(cleanCode)}`);
  };

  return (
    <div className="w-full min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col p-5 sm:p-10 relative overflow-x-hidden">
      {/* Glow background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] max-w-full h-[350px] bg-brand-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] max-w-full h-[300px] bg-sky-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center text-slate-950 shadow-lg shadow-brand-500/30">
            <Compass className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-lg font-black tracking-tight text-white">LongRide</span>
            <span className="text-xs font-extrabold text-brand-400 ml-1 tracking-wider uppercase">GPS</span>
          </div>
        </div>

        {isAuthenticated ? (
          <div className="flex items-center gap-2.5 bg-slate-900/80 border border-white/10 rounded-full pl-1.5 pr-1.5 py-1">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-brand-400/50" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center border border-brand-500/30">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-semibold text-white max-w-[100px] truncate hidden sm:inline">{displayName}</span>
            <button
              onClick={() => signOut()}
              className="w-9 h-9 text-slate-400 hover:text-rose-400 transition-colors rounded-full flex items-center justify-center"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsAuthModalOpen(true)}
            className="gap-1.5 bg-slate-800/90 hover:bg-slate-700 text-xs border border-white/10 px-4 h-10"
          >
            <LogIn className="w-4 h-4 text-brand-400" />
            <span>Log in</span>
          </Button>
        )}
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-3xl mx-auto w-full my-auto text-center space-y-7 py-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border-brand-500/30 text-xs font-semibold text-brand-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
          </span>
          Live group ride navigation
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
          Never lose your pack — on the highway or down the trail.
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto">
          Real-time GPS for motorcycle, bike and hiking groups. One shared map, one destination, everyone visible down to the last alley.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3 pt-2 max-w-md sm:max-w-none mx-auto">
          <Button size="lg" variant="primary" onClick={() => navigate('/create')} className="w-full sm:w-auto px-8 h-14 rounded-2xl">
            <span>Start a ride</span>
            <ArrowRight className="w-5 h-5" />
          </Button>

          <form onSubmit={handleQuickJoin} className="flex w-full sm:w-auto rounded-2xl bg-slate-900/80 border border-white/10 p-1.5 focus-within:border-brand-500/60 transition-colors">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={8}
              placeholder="Room code"
              aria-label="Room code"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 sm:w-36 bg-transparent px-3 text-base font-mono font-bold tracking-[0.2em] text-brand-300 placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans placeholder:font-medium focus:outline-none"
            />
            <button
              type="submit"
              disabled={cleanCode.length < 4}
              className="h-11 px-5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-sm font-bold text-white transition-colors"
            >
              Join
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-8 text-left">
          {FEATURES.map(({ icon: Icon, tint, title, body }) => (
            <div key={title} className="glass-panel p-4 rounded-2xl border-white/5 space-y-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}>
                <Icon className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-white">{title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 text-center text-xs text-slate-500 max-w-5xl mx-auto w-full py-4 border-t border-slate-800/60 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
        LongRide GPS • Built for group rides, convoys & trail packs
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};
