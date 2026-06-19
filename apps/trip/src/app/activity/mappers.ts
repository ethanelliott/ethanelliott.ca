import { Activity } from './activity.entity';
import { Tag } from './tag.entity';
import { ActivityOut, TagOut } from './activity.types';

export function toTagDto(tag: Tag): TagOut {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

export function toActivityDto(activity: Activity, tripId: string): ActivityOut {
  return {
    id: activity.id,
    tripId,
    segmentId: activity.segment?.id ?? null,
    title: activity.title,
    notes: activity.notes ?? null,
    startAt: activity.startAt,
    endAt: activity.endAt,
    color: activity.color ?? null,
    lat: activity.lat ?? null,
    lng: activity.lng ?? null,
    locationLabel: activity.locationLabel ?? null,
    tags: (activity.tags ?? []).map(toTagDto),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}
