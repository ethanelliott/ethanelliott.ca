import { PublicUser, User } from '../users/user';
import { Segment } from './segment.entity';
import { Stay } from './stay.entity';
import { Trip, TripMember } from './trip.entity';
import { SegmentOut, StayOut } from './trip.types';

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
}

export function toTripMemberDto(member: TripMember) {
  return {
    id: member.id,
    user: toPublicUser(member.user),
    role: member.role,
    joinedAt: member.joinedAt,
  };
}

export function toSegmentDto(segment: Segment, tripId: string): SegmentOut {
  return {
    id: segment.id,
    tripId,
    city: segment.city,
    country: segment.country ?? null,
    timezone: segment.timezone,
    startDate: segment.startDate,
    endDate: segment.endDate,
    color: segment.color ?? null,
    lat: segment.lat ?? null,
    lng: segment.lng ?? null,
    locationLabel: segment.locationLabel ?? null,
    position: segment.position,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

export function toStayDto(stay: Stay, tripId: string): StayOut {
  return {
    id: stay.id,
    tripId,
    name: stay.name,
    startDate: stay.startDate,
    endDate: stay.endDate,
    color: stay.color ?? null,
    lat: stay.lat ?? null,
    lng: stay.lng ?? null,
    locationLabel: stay.locationLabel ?? null,
    position: stay.position,
    createdAt: stay.createdAt,
    updatedAt: stay.updatedAt,
  };
}

export function toTripDto(
  trip: Trip,
  members: TripMember[],
  segments: Segment[],
  stays: Stay[]
) {
  return {
    id: trip.id,
    name: trip.name,
    description: trip.description ?? null,
    homeTimezone: trip.homeTimezone,
    baseCurrency: trip.baseCurrency,
    createdBy: trip.createdBy ? toPublicUser(trip.createdBy) : null,
    members: members.map(toTripMemberDto),
    segments: segments.map((s) => toSegmentDto(s, trip.id)),
    stays: stays.map((s) => toStayDto(s, trip.id)),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}
