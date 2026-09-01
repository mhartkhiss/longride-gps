import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Navigation, Users, Shield, ArrowRight, Compass } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { initSession, isInitialized } = useSessionStore();

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

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col justify-between p-6 sm:p-10 relative overflow-x-hidden overflow-y-auto">
      {/* Glow effect background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-brand-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-brand-500/30">
            <Compass className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-lg font-black tracking-tight text-white">LongRide</span>
            <span className="text-xs font-extrabold text-brand-400 ml-1 tracking-wider uppercase">GPS</span>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 max-w-3xl mx-auto w-full my-auto text-center space-y-8 py-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border-brand-500/30 text-xs font-semibold text-brand-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
          </span>
          Multiplayer Live Group Navigation
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Never lose your pack on the open road.
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto font-normal">
          Real-time GPS tracking for motorcycle and cycling group rides. Share live locations, track the pack on a shared map, and navigate to synchronized destinations.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button
            size="lg"
            variant="primary"
            onClick={() => navigate('/create')}
            className="w-full sm:w-auto px-8"
          >
            <span>Create New Ride</span>
            <ArrowRight className="w-4 h-4" />
          </Button>

          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate('/join')}
            className="w-full sm:w-auto px-8 bg-slate-800/80 hover:bg-slate-700"
          >
            <span>Join with Code</span>
          </Button>
        </div>

        {/* Value Prop Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-10 text-left">
          <div className="glass-panel p-4 rounded-2xl border-white/5 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-white">Live Multiplayer</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Broadcast high-frequency GPS positions with smoothed marker animations.
            </p>
          </div>

          <div className="glass-panel p-4 rounded-2xl border-white/5 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-white">Shared Destination</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              The host sets a destination and everyone calculates the optimized route.
            </p>
          </div>

          <div className="glass-panel p-4 rounded-2xl border-white/5 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-white">No Account Needed</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Instant anonymous guest access. No passwords, no sign-up barriers.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-slate-500 max-w-5xl mx-auto w-full py-4 border-t border-slate-800/60">
        LongRide GPS • Built for group rides & convoys
      </footer>
    </div>
  );
};
