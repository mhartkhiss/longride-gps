import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Merge,
  Navigation2,
  RotateCcw,
  Split,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { RouteManeuver } from '@/features/routing/mapboxDirections';

/** Picks the arrow for a Mapbox Directions maneuver. */
export function maneuverIcon(maneuver?: RouteManeuver): LucideIcon {
  if (!maneuver) return ArrowUp;
  const { type, modifier } = maneuver;

  if (type === 'arrive') return Flag;
  if (type === 'depart') return Navigation2;
  if (type.includes('roundabout') || type.includes('rotary')) return RotateCcw;
  if (type === 'merge') return Merge;
  if (type === 'fork' && !modifier) return Split;

  switch (modifier) {
    case 'uturn':
      return Undo2;
    case 'sharp right':
    case 'right':
      return CornerUpRight;
    case 'slight right':
      return ArrowUpRight;
    case 'sharp left':
    case 'left':
      return CornerUpLeft;
    case 'slight left':
      return ArrowUpLeft;
    default:
      return ArrowUp;
  }
}
