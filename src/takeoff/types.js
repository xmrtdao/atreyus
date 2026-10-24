// Component types supported by the takeoff.
// Group is used for BOM roll-up; "light" types roll into Lights total, etc.
export const TYPES = {
  'ceiling-fan':       { label: 'Ceiling fan',        color: '#f59e0b', group: 'fan' },
  'exhaust-fan':       { label: 'Exhaust fan',        color: '#fb923c', group: 'fan' },
  'light-recessed':    { label: 'Light (recessed)',   color: '#facc15', group: 'light' },
  'light-pendant':     { label: 'Light (pendant)',    color: '#fde047', group: 'light' },
  'light-wall':        { label: 'Light (wall)',       color: '#fef08a', group: 'light' },
  'light-exterior':    { label: 'Light (exterior)',   color: '#eab308', group: 'light' },
  'switch':            { label: 'Switch (SP)',        color: '#38bdf8', group: 'switch' },
  'switch-3way':       { label: 'Switch (3-way)',     color: '#22d3ee', group: 'switch' },
  'switch-dimmer':     { label: 'Switch (dimmer)',    color: '#818cf8', group: 'switch' },
  'switch-sensor':     { label: 'Switch (vacancy)',   color: '#a78bfa', group: 'switch' },
  'receptacle':        { label: 'Receptacle',         color: '#34d399', group: 'receptacle' },
  'receptacle-gfi':    { label: 'Receptacle (GFI)',   color: '#10b981', group: 'receptacle' },
  'receptacle-240':    { label: 'Receptacle (240 V)', color: '#059669', group: 'receptacle' },
  'receptacle-wp':     { label: 'Receptacle (WP)',    color: '#047857', group: 'receptacle' },
  'smoke-detector':    { label: 'Smoke / CO Detector',color: '#f87171', group: 'detector' },
  'junction-box':      { label: 'Junction box',       color: '#94a3b8', group: 'other' },
};

export const TYPE_GROUPS = {
  fan: 'Fans',
  light: 'Lights',
  switch: 'Switches',
  receptacle: 'Receptacles',
  detector: 'Detectors',
  other: 'Other',
};

export const DEFAULT_ROOMS = [
  'Living', 'Kitchen', 'Dining', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3',
  'Bath', 'Bath 2', 'Laundry', 'Closet', 'Hall', 'Garage', 'Exterior', 'Unassigned',
];
