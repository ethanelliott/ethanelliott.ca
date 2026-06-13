import type { Car, Category } from './models';

export const CARS: Car[] = [
  {
    id: 'rav4',
    name: 'RAV4 Hybrid',
    brand: 'Toyota',
    color: '#D23B2E',
    tint: '#FBECEA',
    tag: 'All-new 2026 redesign · the efficiency champ.',
    specs: {
      Fuel: '5.4–6.0 L/100km',
      Power: '226–236 hp',
      Gearbox: 'e-CVT',
      AWD: 'Standard',
      Warranty: '3y/60 · 5y/100',
    },
    feel: 'Brand-new, bigger screen and the best fuel numbers of the three. Boxier body — pay attention to how the ride feels.',
    watch: 'Hot new redesign: expect tight inventory and little to no discounting.',
  },
  {
    id: 'crv',
    name: 'CR-V Hybrid',
    brand: 'Honda',
    color: '#2D63C8',
    tint: '#EAF0FB',
    tag: 'The roomy, quiet, refined one.',
    specs: {
      Fuel: '6.4 L/100km',
      Power: '204 hp',
      Gearbox: 'e-CVT',
      AWD: 'Yes',
      Warranty: '3y/60 · 5y/100',
    },
    feel: 'Least power on paper but praised as the most spacious and quiet. Really test the back seat, cargo, and how much noise gets in.',
    watch: '',
  },
  {
    id: 'tucson',
    name: 'Tucson Hybrid',
    brand: 'Hyundai',
    color: '#0C9488',
    tint: '#E4F4F2',
    tag: 'Most power · longest bumper-to-bumper.',
    specs: {
      Fuel: '6.7 L/100km',
      Power: '231 hp · 271 lb-ft',
      Gearbox: '6-spd auto',
      AWD: 'Standard',
      Warranty: '5y/100 · 5y/100',
    },
    feel: 'The strongest engine and the only one with real gear changes (not a CVT). Plush, well-soundproofed cabin — see if you prefer that feel.',
    watch: 'Hybrid starts at the N Line trim here, and this generation ends soon (2027 redesign).',
  },
];

export const CATS: Category[] = [
  { id: 'power',    name: 'Power & acceleration',     hint: 'Floor it merging onto a highway. Enough push, or does it strain?' },
  { id: 'trans',    name: 'Transmission feel',         hint: 'Smooth power delivery? CVTs (RAV4/CR-V) can "drone"; the Tucson shifts real gears.' },
  { id: 'ride',     name: 'Ride comfort',              hint: 'Over bumps and rough pavement — composed or jarring?' },
  { id: 'quiet',    name: 'Cabin quietness',           hint: 'Radio off. How much road, wind, and engine noise gets in?' },
  { id: 'seat',     name: 'Seat & driving position',   hint: 'Easy to dial in the seat and wheel? Comfy after ten minutes?' },
  { id: 'view',     name: 'Visibility & blind spots',  hint: 'Can you see out easily? Check mirrors and look over your shoulder.' },
  { id: 'space',    name: 'Rear seat & cargo',         hint: 'Sit in the back. Open the trunk. Room for your people and stuff?' },
  { id: 'tech',     name: 'Tech & infotainment',       hint: 'Screen easy to use? CarPlay / Android Auto connect cleanly? Laggy?' },
  { id: 'controls', name: 'Controls & ergonomics',     hint: 'Climate, volume, wipers — easy to find and use while driving?' },
  { id: 'park',     name: 'Parking & maneuvering',     hint: 'Park it. Easy to place? Good cameras? Tight turning circle?' },
  { id: 'gut',      name: 'Overall gut feel',          hint: "Forget the specs — do you actually want to drive this one home?" },
];

export const PIP_RANGE = [1, 2, 3, 4, 5] as const;
