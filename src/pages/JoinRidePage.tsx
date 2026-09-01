import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Users, KeyRound } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { RideService } from '@/features/rides/rideService';

export const JoinRidePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { displayName, vehicleType, setDisplayName, initSession, isInitialized } = useSessionStore();

  const [roomCode, setRoomCode] = useState(searchParams.get('code') || '');
  const [nameInput, setNameInput] = useState(displayName);
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
    const cleanCode = roomCode.trim().toUpperCase();

    if (cleanCode.length < 4) {
      setError('Please enter a valid room code');
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

      // 1. Look up ride by code
      const ride = await RideService.getRideByCode(cleanCode);
      if (!ride) {
        setError('No active ride found with this room code. Please check and try again.');
        setIsLoading(false);
        return;
      }

      // 2. Join as participant
      await RideService.joinRide(ride.id, nameInput.trim(), vehicleType || 'motorcycle');

      // 3. Navigate to ride room
      navigate(`/ride/${ride.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join ride';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      const formEl = document.querySelector('form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);
  };

  return (
    <div className="w-full min-h-screen min-h-[100dvh] bg-[#0B0F19] text-white flex flex-col justify-center items-center p-4 sm:p-6 pt-6 pb-32 sm:py-12 relative overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10 my-auto transition-transform duration-300 ease-out focus-within:-translate-y-6 sm:focus-within:translate-y-0">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-white/10 shadow-2xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Join Group Ride</h2>
              <p className="text-xs text-slate-400">Enter the 6-character room code from your host</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="room-code-input" className="block text-xs font-medium text-slate-300">
                Room Code
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="room-code-input"
                  type="text"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. CEB824"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onFocus={handleInputFocus}
                  className="w-full bg-slate-900/80 border border-slate-700/80 text-brand-300 font-mono text-lg tracking-widest uppercase rounded-xl pl-10 pr-3.5 py-2.5 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  required
                />
              </div>
            </div>

            <Input
              label="Your Display Name"
              placeholder="e.g. Mark, Alex"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onFocus={handleInputFocus}
              required
            />

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
              Join Ride Session
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
