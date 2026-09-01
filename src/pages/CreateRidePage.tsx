import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Compass, Bike, Car, Footprints } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';
import { VehicleMode } from '@/types/database';

export const CreateRidePage: React.FC = () => {
  const navigate = useNavigate();
  const { displayName, vehicleType, setDisplayName, setVehicleType, initSession, isInitialized } = useSessionStore();

  const [rideName, setRideName] = useState('');
  const [nameInput, setNameInput] = useState(displayName);
  const [mode, setMode] = useState<VehicleMode>('driving');
  const [selectedVehicle, setSelectedVehicle] = useState(vehicleType || 'motorcycle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) initSession();
  }, [initSession, isInitialized]);

  useEffect(() => {
    if (displayName && !nameInput) {
      setNameInput(displayName);
    }
  }, [displayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideName.trim()) {
      setError('Please provide a ride session name');
      return;
    }
    if (!nameInput.trim()) {
      setError('Please enter your rider display name');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await initSession();
      setDisplayName(nameInput.trim());
      setVehicleType(selectedVehicle);

      const { ride } = await RideService.createRide(
        rideName.trim(),
        mode,
        nameInput.trim(),
        selectedVehicle
      );

      navigate(`/ride/${ride.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create ride';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col justify-center items-center p-4 sm:p-6 py-6 sm:py-12 relative overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10 my-auto transition-transform duration-300 ease-out focus-within:-translate-y-8 sm:focus-within:translate-y-0">
        {/* Back Link */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-white/10 shadow-2xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Create Group Ride</h2>
              <p className="text-xs text-slate-400">You will be designated as the session host</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Ride Name"
              placeholder="e.g. Sunday Cebu Twisties, Coastal Cruisers"
              value={rideName}
              onChange={(e) => setRideName(e.target.value)}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              required
              autoFocus
            />

            <Input
              label="Your Display Name"
              placeholder="e.g. Juan, Captain Rider"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              required
            />

            {/* Vehicle Mode Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Navigation Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('driving'); setSelectedVehicle('motorcycle'); }}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    mode === 'driving'
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Motor / Car</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('cycling'); setSelectedVehicle('bicycle'); }}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    mode === 'cycling'
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>Cycling</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('walking'); setSelectedVehicle('walking'); }}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    mode === 'walking'
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Footprints className="w-4 h-4" />
                  <span>Walking</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Start Ride & Get Code
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
