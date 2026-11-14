import React from 'react';
import { Box, Footprints, Map as MapIcon, Moon, Navigation2, Route, Satellite, Sun, SunMoon, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MapType, ThemeSetting, useMapStore } from '@/stores/mapStore';
import { trailStore } from '@/features/location/trailStore';
import { cn, haptic } from '@/lib/utils';

interface MapLayersSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAP_TYPES: Array<{ id: MapType; label: string; hint: string; icon: typeof MapIcon }> = [
  { id: 'standard', label: 'Map', hint: 'Streets, alleys & buildings', icon: MapIcon },
  { id: 'satellite', label: 'Satellite', hint: 'See unmapped trails', icon: Satellite },
];

const THEMES: Array<{ id: ThemeSetting; label: string; icon: typeof Sun }> = [
  { id: 'auto', label: 'Auto', icon: SunMoon },
  { id: 'day', label: 'Day', icon: Sun },
  { id: 'night', label: 'Night', icon: Moon },
];

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ icon, title, description, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => {
      haptic(15);
      onChange(!checked);
    }}
    className="w-full min-h-[56px] flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-800/50 hover:bg-slate-800/80 border border-white/5 text-left transition-colors"
  >
    <span className="w-9 h-9 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-white truncate">{title}</span>
      <span className="block text-xs text-slate-400 leading-snug">{description}</span>
    </span>
    <span
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors shrink-0',
        checked ? 'bg-brand-500' : 'bg-slate-600'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </span>
  </button>
);

export const MapLayersSheet: React.FC<MapLayersSheetProps> = ({ isOpen, onClose }) => {
  const settings = useMapStore((s) => s.settings);
  const updateSettings = useMapStore((s) => s.updateSettings);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Map view" description="Choose how the ride map looks">
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-2.5">
          {MAP_TYPES.map(({ id, label, hint, icon: Icon }) => {
            const active = settings.mapType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  haptic(20);
                  updateSettings({ mapType: id });
                }}
                className={cn(
                  'rounded-2xl border p-3 text-left transition-all active:scale-[0.98]',
                  active
                    ? 'border-brand-500 bg-brand-500/15 shadow-lg shadow-brand-500/10'
                    : 'border-white/10 bg-slate-800/50 hover:bg-slate-800/80'
                )}
              >
                <Icon className={cn('w-6 h-6 mb-2', active ? 'text-brand-300' : 'text-slate-300')} />
                <span className="block text-sm font-bold text-white">{label}</span>
                <span className="block text-[11px] text-slate-400 leading-snug">{hint}</span>
              </button>
            );
          })}
        </section>

        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Light</p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-800/60 border border-white/5">
            {THEMES.map(({ id, label, icon: Icon }) => {
              const active = settings.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    haptic(15);
                    updateSettings({ theme: id });
                  }}
                  className={cn(
                    'h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors',
                    active ? 'bg-slate-950 text-white shadow' : 'text-slate-400 hover:text-white'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
          {settings.theme === 'auto' && (
            <p className="text-[11px] text-slate-500 mt-1.5 px-1">Switches with sunrise and sunset where you are.</p>
          )}
        </section>

        <section className="space-y-2">
          <ToggleRow
            icon={<Navigation2 className="w-4 h-4" />}
            title="Heading-up navigation"
            description="Map turns with you, like GTA / Google Maps"
            checked={settings.headingUp}
            onChange={(headingUp) => updateSettings({ headingUp })}
          />
          <ToggleRow
            icon={<Box className="w-4 h-4" />}
            title="3D view"
            description="Tilted camera with 3D buildings"
            checked={settings.tilt3D}
            onChange={(tilt3D) => updateSettings({ tilt3D })}
          />
          <ToggleRow
            icon={<Footprints className="w-4 h-4" />}
            title="Trails & pathways"
            description="Highlight footpaths, alleys and dirt tracks"
            checked={settings.showPathways}
            onChange={(showPathways) => updateSettings({ showPathways })}
          />
          <ToggleRow
            icon={<Route className="w-4 h-4" />}
            title="Rider breadcrumbs"
            description="Draw where everyone has ridden"
            checked={settings.showTrails}
            onChange={(showTrails) => updateSettings({ showTrails })}
          />
        </section>

        {settings.showTrails && (
          <button
            type="button"
            onClick={() => {
              haptic(30);
              trailStore.clear();
            }}
            className="w-full h-11 rounded-2xl border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800/60 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear breadcrumb trails
          </button>
        )}
      </div>
    </Modal>
  );
};
