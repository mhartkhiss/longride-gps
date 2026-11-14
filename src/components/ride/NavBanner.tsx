import React from 'react';
import { Flag } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { formatDistance } from '@/lib/utils';
import { maneuverIcon } from './maneuverIcon';

/**
 * Turn-by-turn banner (Google Maps green card): next maneuver, distance to it,
 * and a "Then" hint when two turns come close together.
 */
export const NavBanner: React.FC = () => {
  const progress = useRideStore((s) => s.routeProgress);
  const destination = useRideStore((s) => s.destination);

  if (!progress || !destination) return null;

  if (progress.arrived) {
    return (
      <div className="lr-anim-drop rounded-3xl bg-emerald-700/95 border border-emerald-400/40 shadow-2xl shadow-black/40 px-4 py-3 flex items-center gap-3 backdrop-blur-md">
        <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Flag className="w-6 h-6 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100/80">You have arrived</p>
          <p className="text-base font-extrabold text-white truncate">{destination.name}</p>
        </div>
      </div>
    );
  }

  const step = progress.nextStep;
  if (!step || progress.distanceToNextStep === null) return null;

  const Icon = maneuverIcon(step.maneuver);
  const isArrival = step.maneuver?.type === 'arrive';
  const title = isArrival ? destination.name : step.name || step.instruction;
  const subtitle = isArrival ? 'Destination ahead' : step.name ? step.instruction : null;
  const ThenIcon = progress.followingStep && step.distance < 150 ? maneuverIcon(progress.followingStep.maneuver) : null;

  return (
    <div className="lr-anim-drop flex flex-col items-start gap-1.5">
      <div className="w-full rounded-3xl bg-emerald-700/95 border border-emerald-400/40 shadow-2xl shadow-black/40 px-3.5 py-3 flex items-center gap-3 backdrop-blur-md">
        <span className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Icon className="w-8 h-8 text-white" strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-black text-white leading-none tabular-nums">
            {formatDistance(progress.distanceToNextStep)}
          </p>
          <p className="text-sm font-bold text-white truncate mt-1">{title}</p>
          {subtitle && <p className="text-[11px] text-emerald-100/80 truncate">{subtitle}</p>}
        </div>
      </div>
      {ThenIcon && (
        <div className="ml-3 rounded-2xl bg-emerald-900/95 border border-emerald-400/30 px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold text-emerald-50 shadow-lg">
          Then <ThenIcon className="w-4 h-4" strokeWidth={2.6} />
        </div>
      )}
    </div>
  );
};
