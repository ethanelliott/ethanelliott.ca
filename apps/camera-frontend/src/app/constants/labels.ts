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
