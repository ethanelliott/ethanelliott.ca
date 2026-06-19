import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Segment } from './segment.entity';
import { Trip } from './trip.entity';
import { toSegmentDto } from './mappers';
import {
  CreateSegmentInput,
  ReorderSegmentsInput,
  UpdateSegmentInput,
} from './trip.types';
import { TripsService } from './trips.service';

export class SegmentsService {
  private readonly _segmentRepository =
    inject(Database).repositoryFor(Segment);
  private readonly _tripsService = inject(TripsService);

  private async loadSegments(tripId: string): Promise<Segment[]> {
    return this._segmentRepository.find({
      where: { trip: { id: tripId } },
      order: { position: 'ASC', startDate: 'ASC' },
    });
  }

  /** Load a segment scoped to a trip the user belongs to. */
  private async loadOwnedSegment(
    tripId: string,
    segmentId: string,
    userId: string
  ): Promise<Segment> {
    await this._tripsService.assertMember(tripId, userId);
    const segment = await this._segmentRepository.findOne({
      where: { id: segmentId, trip: { id: tripId } },
    });
    if (!segment) {
      throw new HttpErrors.NotFound('Segment not found');
    }
    return segment;
  }

  async list(tripId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const segments = await this.loadSegments(tripId);
    return segments.map((s) => toSegmentDto(s, tripId));
  }

  async create(tripId: string, userId: string, input: CreateSegmentInput) {
    await this._tripsService.assertMember(tripId, userId);

    const last = await this._segmentRepository.findOne({
      where: { trip: { id: tripId } },
      order: { position: 'DESC' },
    });
    const position = last ? last.position + 1 : 0;

    const segment = await this._segmentRepository.save(
      this._segmentRepository.create({
        trip: { id: tripId } as Trip,
        city: input.city,
        country: input.country,
        hotelName: input.hotelName,
        timezone: input.timezone,
        startDate: input.startDate,
        endDate: input.endDate,
        color: input.color,
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        locationLabel: input.locationLabel ?? undefined,
        position,
      })
    );

    return toSegmentDto(segment, tripId);
  }

  async update(
    tripId: string,
    segmentId: string,
    userId: string,
    input: UpdateSegmentInput
  ) {
    const segment = await this.loadOwnedSegment(tripId, segmentId, userId);

    // Guard the combined date range when only one bound is supplied.
    const startDate = input.startDate ?? segment.startDate;
    const endDate = input.endDate ?? segment.endDate;
    if (startDate > endDate) {
      throw new HttpErrors.BadRequest(
        'startDate must be on or before endDate'
      );
    }

    if (Object.keys(input).length > 0) {
      await this._segmentRepository.update(segment.id, input);
    }
    const updated = await this._segmentRepository.findOneByOrFail({
      id: segment.id,
    });
    return toSegmentDto(updated, tripId);
  }

  async remove(tripId: string, segmentId: string, userId: string) {
    const segment = await this.loadOwnedSegment(tripId, segmentId, userId);
    await this._segmentRepository.delete(segment.id);
    return { success: true };
  }

  async reorder(tripId: string, userId: string, input: ReorderSegmentsInput) {
    await this._tripsService.assertMember(tripId, userId);

    const segments = await this.loadSegments(tripId);
    const known = new Set(segments.map((s) => s.id));
    const allPresent =
      input.segmentIds.length === segments.length &&
      input.segmentIds.every((id) => known.has(id));
    if (!allPresent) {
      throw new HttpErrors.BadRequest(
        'segmentIds must list every segment in this trip exactly once'
      );
    }

    await Promise.all(
      input.segmentIds.map((id, index) =>
        this._segmentRepository.update(id, { position: index })
      )
    );

    const reordered = await this.loadSegments(tripId);
    return reordered.map((s) => toSegmentDto(s, tripId));
  }
}
