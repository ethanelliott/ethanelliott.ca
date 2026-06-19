import { PublicUser, User } from '../users/user';
import { Segment } from './segment.entity';
import { Trip, TripMember } from './trip.entity';
import { SegmentOut } from './trip.types';

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
    hotelName: segment.hotelName ?? null,
    timezone: segment.timezone,
    startDate: segment.startDate,
    endDate: segment.endDate,
    color: segment.color ?? null,
    position: segment.position,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

export function toTripDto(
  trip: Trip,
  members: TripMember[],
  segments: Segment[]
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
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}
