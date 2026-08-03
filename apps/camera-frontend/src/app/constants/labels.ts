export const COCO_LABELS = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
] as const;

export type CocoLabel = (typeof COCO_LABELS)[number];

/** Dropdown-ready options for all 80 COCO labels. */
export const LABEL_OPTIONS = COCO_LABELS.map((value) => ({
  label: value
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' '),
  value,
}));

/**
 * Colours for the labels that actually show up on an outdoor camera. Shared
 * by the bounding-box overlay, the timeline markers and the event list so a
 * label reads the same colour everywhere.
 */
export const LABEL_COLORS: Record<string, string> = {
  person: '#3b82f6',
  car: '#22c55e',
  truck: '#eab308',
  bicycle: '#a855f7',
  motorcycle: '#f97316',
  bus: '#06b6d4',
  cat: '#ec4899',
  dog: '#f43f5e',
  bird: '#14b8a6',
};

export const DEFAULT_LABEL_COLOR = '#3b82f6';

export function labelColor(label: string): string {
  return LABEL_COLORS[label] ?? DEFAULT_LABEL_COLOR;
}

/**
 * Display strings for the scene-analysis taxonomy. The authoritative lists
 * live in the backend and are served at `/analysis/taxonomy` — these exist so
 * a card can render a label without waiting on a request. Anything missing
 * falls back to the raw value rather than rendering blank.
 */
const ACTIVITY_LABELS: Record<string, string> = {
  nothing_notable: 'Nothing notable',
  person_passing: 'Person passing through',
  person_loitering: 'Person loitering',
  person_approaching: 'Person approaching',
  person_at_entrance: 'Person at entrance',
  person_with_package: 'Person with package',
  person_at_vehicle: 'Person at a vehicle',
  group_gathering: 'Group gathering',
  vehicle_passing: 'Vehicle passing',
  vehicle_arriving: 'Vehicle arriving',
  vehicle_departing: 'Vehicle departing',
  vehicle_parked_occupied: 'Occupied parked vehicle',
  delivery: 'Delivery',
  animal_present: 'Animal present',
  view_obstructed: 'View obstructed',
  other: 'Other',
};

const TRIGGER_LABELS: Record<string, string> = {
  person_after_dark: 'Person after dark',
  loitering: 'Loitering',
  approaching_entrance: 'Approaching entrance',
  trying_doors_or_handles: 'Trying doors or handles',
  looking_into_vehicles: 'Looking into vehicles',
  package_interaction: 'Package interaction',
  face_concealed: 'Face concealed',
  multiple_people: 'Multiple people',
  carrying_large_object: 'Carrying a large object',
  unfamiliar_vehicle: 'Unfamiliar vehicle',
  vehicle_occupied_after_dark: 'Occupied vehicle after dark',
  large_animal: 'Large animal',
  camera_obstructed: 'Camera obstructed',
};

/** Turn a snake_case enum value into something readable. */
function humanize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export function activityLabel(activity: string): string {
  return ACTIVITY_LABELS[activity] ?? humanize(activity);
}

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABELS[trigger] ?? humanize(trigger);
}

export const THREAT_LEVELS = [
  'benign',
  'notable',
  'suspicious',
  'critical',
] as const;

/** PrimeIcons name for a detection label. */
export function labelIcon(label: string): string {
  const icons: Record<string, string> = {
    person: 'pi-user',
    car: 'pi-car',
    truck: 'pi-truck',
    bus: 'pi-truck',
    bicycle: 'pi-compass',
    motorcycle: 'pi-compass',
    cat: 'pi-heart',
    dog: 'pi-heart',
    bird: 'pi-sun',
  };
  return icons[label] ?? 'pi-eye';
}
