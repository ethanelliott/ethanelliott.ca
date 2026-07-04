import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { In } from 'typeorm';
import { Database } from '../data-source';
import { User } from '../users/user';
import { UsersService } from '../users/users.service';
import { Segment } from './segment.entity';
import { Stay } from './stay.entity';
import { Trip, TripMember } from './trip.entity';
import { toTripDto } from './mappers';
import {
  CreateTripInput,
  TripSummaryOut,
  UpdateTripInput,
} from './trip.types';

export class TripsService {
  private readonly _tripRepository = inject(Database).repositoryFor(Trip);
  private readonly _memberRepository =
    inject(Database).repositoryFor(TripMember);
  private readonly _segmentRepository =
    inject(Database).repositoryFor(Segment);
  private readonly _stayRepository = inject(Database).repositoryFor(Stay);
  private readonly _usersService = inject(UsersService);

  /** Throw unless the user is a member of the trip; returns the trip. */
  async assertMember(tripId: string, userId: string): Promise<Trip> {
    const trip = await this._tripRepository.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new HttpErrors.NotFound('Trip not found');
    }
    const membership = await this._memberRepository.findOne({
      where: { trip: { id: tripId }, user: { id: userId } },
    });
    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this trip');
    }
    return trip;
  }

  /** Throw unless the user is the owner of the trip; returns the membership. */
  private async assertOwner(
    tripId: string,
    userId: string
  ): Promise<TripMember> {
    const trip = await this._tripRepository.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new HttpErrors.NotFound('Trip not found');
    }
    const membership = await this._memberRepository.findOne({
      where: { trip: { id: tripId }, user: { id: userId } },
    });
    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this trip');
    }
    if (membership.role !== 'owner') {
      throw new HttpErrors.Forbidden('Only the trip owner can do that');
    }
    return membership;
  }

  private loadMembers(tripId: string): Promise<TripMember[]> {
    return this._memberRepository.find({
      where: { trip: { id: tripId } },
      order: { joinedAt: 'ASC' },
    });
  }

  private loadSegments(tripId: string): Promise<Segment[]> {
    return this._segmentRepository.find({
      where: { trip: { id: tripId } },
      order: { position: 'ASC', startDate: 'ASC' },
    });
  }

  private loadStays(tripId: string): Promise<Stay[]> {
    return this._stayRepository.find({
      where: { trip: { id: tripId } },
      order: { startDate: 'ASC', position: 'ASC' },
    });
  }

  async listForUser(userId: string): Promise<TripSummaryOut[]> {
    const memberships = await this._memberRepository.find({
      where: { user: { id: userId } },
      relations: { trip: true },
    });
    if (memberships.length === 0) return [];

    // Batch-load members and segments for every trip at once instead of
    // issuing per-trip queries in a loop.
    const tripIds = memberships.map((m) => m.trip.id);
    const [allMembers, allSegments] = await Promise.all([
      this._memberRepository.find({
        where: { trip: { id: In(tripIds) } },
        relations: { trip: true },
        order: { joinedAt: 'ASC' },
      }),
      this._segmentRepository.find({
        where: { trip: { id: In(tripIds) } },
        relations: { trip: true },
        order: { position: 'ASC', startDate: 'ASC' },
      }),
    ]);

    const groupByTrip = <T extends { trip: Trip }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        const group = map.get(row.trip.id);
        if (group) group.push(row);
        else map.set(row.trip.id, [row]);
      }
      return map;
    };
    const membersByTrip = groupByTrip(allMembers);
    const segmentsByTrip = groupByTrip(allSegments);

    const summaries: TripSummaryOut[] = [];
    for (const membership of memberships) {
      const trip = membership.trip;
      const members = membersByTrip.get(trip.id) ?? [];
      const segments = segmentsByTrip.get(trip.id) ?? [];

      const startDate = segments.length
        ? segments.reduce((min, s) => (s.startDate < min ? s.startDate : min), segments[0].startDate)
        : null;
      const endDate = segments.length
        ? segments.reduce((max, s) => (s.endDate > max ? s.endDate : max), segments[0].endDate)
        : null;

      summaries.push({
        id: trip.id,
        name: trip.name,
        description: trip.description ?? null,
        homeTimezone: trip.homeTimezone,
        baseCurrency: trip.baseCurrency,
        memberCount: members.length,
        members: members.map((m) => ({
          id: m.id,
          user: { id: m.user.id, name: m.user.name, username: m.user.username },
          role: m.role,
          joinedAt: m.joinedAt,
        })),
        segmentCount: segments.length,
        startDate,
        endDate,
        updatedAt: trip.updatedAt,
      });
    }

    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  }

  async getById(tripId: string, userId: string) {
    const trip = await this.assertMember(tripId, userId);
    const members = await this.loadMembers(tripId);
    const segments = await this.loadSegments(tripId);
    const stays = await this.loadStays(tripId);
    return toTripDto(trip, members, segments, stays);
  }

  async create(userId: string, input: CreateTripInput) {
    const creator = await this._usersService.findEntityById(userId);
    if (!creator) {
      throw new HttpErrors.Unauthorized('User not found');
    }

    const trip = await this._tripRepository.save(
      this._tripRepository.create({
        name: input.name,
        description: input.description,
        homeTimezone: input.homeTimezone,
        baseCurrency: input.baseCurrency,
        createdBy: creator,
      })
    );

    // The creator joins as the owner.
    await this.addMemberEntity(trip, creator.id, 'owner');

    // Add any requested members by username (ignore unknown/duplicate/self).
    for (const username of input.memberUsernames ?? []) {
      const user = await this._usersService.findEntityByUsername(username);
      if (user && user.id !== creator.id) {
        await this.addMemberEntity(trip, user.id, 'member');
      }
    }

    return this.getById(trip.id, userId);
  }

  async update(tripId: string, userId: string, input: UpdateTripInput) {
    await this.assertMember(tripId, userId);
    if (Object.keys(input).length > 0) {
      await this._tripRepository.update(tripId, input);
    }
    return this.getById(tripId, userId);
  }

  async remove(tripId: string, userId: string) {
    await this.assertOwner(tripId, userId);
    await this._tripRepository.delete(tripId);
    return { success: true };
  }

  private async addMemberEntity(
    trip: Trip,
    userId: string,
    role: 'owner' | 'member'
  ) {
    const existing = await this._memberRepository.findOne({
      where: { trip: { id: trip.id }, user: { id: userId } },
    });
    if (existing) return existing;
    return this._memberRepository.save(
      this._memberRepository.create({
        trip,
        user: { id: userId } as User,
        role,
      })
    );
  }

  async addMember(tripId: string, userId: string, username: string) {
    const trip = await this.assertMember(tripId, userId);
    const user = await this._usersService.findEntityByUsername(username);
    if (!user) {
      throw new HttpErrors.NotFound(`No user with username "${username}"`);
    }
    await this.addMemberEntity(trip, user.id, 'member');
    return this.getById(tripId, userId);
  }

  async removeMember(tripId: string, userId: string, memberUserId: string) {
    // Leaving yourself is always allowed; removing others requires ownership.
    if (memberUserId !== userId) {
      await this.assertOwner(tripId, userId);
    } else {
      await this.assertMember(tripId, userId);
    }

    const membership = await this._memberRepository.findOne({
      where: { trip: { id: tripId }, user: { id: memberUserId } },
    });
    if (!membership) {
      throw new HttpErrors.NotFound('That user is not a member of this trip');
    }
    if (membership.role === 'owner') {
      throw new HttpErrors.BadRequest('The trip owner cannot be removed');
    }

    await this._memberRepository.delete({ id: membership.id });
    return this.getById(tripId, userId);
  }
}
