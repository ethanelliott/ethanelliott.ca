/**
 * The vocabulary the vision model classifies a frame into.
 *
 * Everything here is a closed enum rather than free text or a numeric score.
 * A 0–10 "anomaly score" reads precisely but is not: vision models cluster on
 * a handful of values, drift between runs at the same temperature, and give no
 * way to write a rule against the result. Named categories are reproducible,
 * filterable, and can be wired straight to a notification decision.
 */

/** What is happening in the frame. */
export const SCENE_ACTIVITIES = [
  'nothing_notable',
  'person_passing',
  'person_loitering',
  'person_approaching',
  'person_at_entrance',
  'person_with_package',
  'person_at_vehicle',
  'group_gathering',
  'vehicle_passing',
  'vehicle_arriving',
  'vehicle_departing',
  'vehicle_parked_occupied',
  'delivery',
  'animal_present',
  'view_obstructed',
  'other',
] as const;
export type SceneActivity = (typeof SCENE_ACTIVITIES)[number];

/**
 * How much attention the frame deserves. Four levels, because a model can
 * hold four distinctions steady in a way it cannot hold eleven.
 */
export const THREAT_LEVELS = ['benign', 'notable', 'suspicious', 'critical'] as const;
export type ThreatLevel = (typeof THREAT_LEVELS)[number];

/** Ordering for "at least this severe" comparisons. */
export const THREAT_ORDER: Record<ThreatLevel, number> = {
  benign: 0,
  notable: 1,
  suspicious: 2,
  critical: 3,
};

/**
 * ntfy priority per threat level.
 *
 * The levels exist so an alert can arrive without demanding attention. ntfy
 * treats 2 as silent-but-visible, 3 as a normal notification, 4 as sound and
 * vibration, and 5 as urgent enough to break through do-not-disturb. Mapping
 * threat onto that is what makes "tell me when anyone walks past" survivable:
 * the phone lists it without buzzing, and keeps the buzz for the frames that
 * earned it.
 */
export const THREAT_PRIORITY: Record<ThreatLevel, number> = {
  benign: 2,
  notable: 3,
  suspicious: 4,
  critical: 5,
};

/**
 * Cooldown multiplier per threat level.
 *
 * A quiet alert is still an interruption if it arrives thirty times an hour,
 * so the less a level matters the longer it waits between repeats. Critical
 * is never held back — suppressing it because something else happened
 * recently is the one failure that would matter.
 *
 * These stay modest because the heavier deduplication happens elsewhere: each
 * subject is only announced once unless it escalates, so this window is only
 * protecting against several *different* subjects at once — which is the case
 * where wanting to be told is most reasonable.
 */
export const THREAT_COOLDOWN_SCALE: Record<ThreatLevel, number> = {
  benign: 3,
  notable: 2,
  suspicious: 1,
  critical: 0,
};

/**
 * Concrete conditions the model is asked to check for, independent of its
 * overall judgement. These are what notification rules are written against:
 * "wake me for `face_concealed`" is a rule someone can reason about, where
 * "wake me above 7/10" is not.
 */
export const NOTIFY_TRIGGERS = [
  'person_after_dark',
  'loitering',
  'approaching_entrance',
  'trying_doors_or_handles',
  'looking_into_vehicles',
  'package_interaction',
  'face_concealed',
  'multiple_people',
  'carrying_large_object',
  'unfamiliar_vehicle',
  'vehicle_occupied_after_dark',
  'large_animal',
  'camera_obstructed',
] as const;
export type NotifyTrigger = (typeof NOTIFY_TRIGGERS)[number];

export const LIGHTING_CONDITIONS = [
  'daylight',
  'overcast',
  'dusk',
  'night',
  'glare',
] as const;
export type LightingCondition = (typeof LIGHTING_CONDITIONS)[number];

/** Whether the frame is good enough to trust the rest of the analysis. */
export const VISIBILITY_LEVELS = ['clear', 'partial', 'poor'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/** Human-facing copy, kept next to the enums so the two cannot drift. */
export const ACTIVITY_LABELS: Record<SceneActivity, string> = {
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

export const TRIGGER_LABELS: Record<NotifyTrigger, string> = {
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

/**
 * Legacy 0–10 scores are mapped onto the new levels so rows written before
 * the taxonomy existed still sort and filter alongside new ones.
 */
export function threatFromLegacyScore(score: number | null): ThreatLevel {
  if (score === null) return 'benign';
  if (score >= 8) return 'critical';
  if (score >= 5) return 'suspicious';
  if (score >= 2) return 'notable';
  return 'benign';
}

/** The old LOW/MEDIUM/HIGH rating, kept so existing filters keep working. */
export function ratingFromThreat(
  threat: ThreatLevel
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (threat === 'critical') return 'HIGH';
  if (threat === 'suspicious') return 'MEDIUM';
  return 'LOW';
}

/** A coarse numeric score, retained for the existing score display. */
export function scoreFromThreat(threat: ThreatLevel): number {
  return { benign: 1, notable: 4, suspicious: 7, critical: 9 }[threat];
}
