import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Between } from 'typeorm';
import { Database } from '../data-source';
import { Segment } from '../trip/segment.entity';
import { Trip } from '../trip/trip.entity';
import { TripsService } from '../trip/trips.service';
import { Activity } from './activity.entity';
import { toActivityDto } from './mappers';
import { LegendService } from './legend.service';
import { TagsService } from './tags.service';
import { CreateActivityInput, UpdateActivityInput } from './activity.types';

export class ActivitiesService {
  private readonly _activityRepository =
    inject(Database).repositoryFor(Activity);
  private readonly _segmentRepository =
    inject(Database).repositoryFor(Segment);
  private readonly _tripsService = inject(TripsService);
  private readonly _tagsService = inject(TagsService);
  private readonly _legendService = inject(LegendService);

  /** Validate that a segment (if given) belongs to the trip. */
  private async resolveSegment(
    tripId: string,
    segmentId: string | null | undefined
  ): Promise<Segment | null> {
    if (!segmentId) return null;
    const segment = await this._segmentRepository.findOne({
      where: { id: segmentId, trip: { id: tripId } },
    });
    if (!segment) {
      throw new HttpErrors.BadRequest('Segment does not belong to this trip');
    }
    return segment;
  }

  private loadOne(tripId: string, activityId: string) {
    return this._activityRepository.findOne({
      where: { id: activityId, trip: { id: tripId } },
      relations: { tags: true, segment: true, legendCategory: true },
    });
  }

  async list(
    tripId: string,
    userId: string,
    range?: { from?: string; to?: string }
  ) {
    await this._tripsService.assertMember(tripId, userId);

    const where: Record<string, unknown> = { trip: { id: tripId } };
    if (range?.from && range?.to) {
      where['startAt'] = Between(new Date(range.from), new Date(range.to));
    }

    const activities = await this._activityRepository.find({
      where,
      relations: { tags: true, segment: true, legendCategory: true },
      order: { startAt: 'ASC' },
    });
    return activities.map((a) => toActivityDto(a, tripId));
  }

  async create(tripId: string, userId: string, input: CreateActivityInput) {
    await this._tripsService.assertMember(tripId, userId);
    const segment = await this.resolveSegment(tripId, input.segmentId);
    const legendCategory = await this._legendService.resolveForTrip(
      tripId,
      input.legendCategoryId
    );
    const tags = await this._tagsService.resolveForTrip(
      tripId,
      input.tagIds ?? []
    );

    const activity = await this._activityRepository.save(
      this._activityRepository.create({
        trip: { id: tripId } as Trip,
        segment,
        legendCategory,
        title: input.title,
        notes: input.notes,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        color: input.color,
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        locationLabel: input.locationLabel ?? undefined,
        tags,
      })
    );

    const full = await this.loadOne(tripId, activity.id);
    return toActivityDto(full ?? activity, tripId);
  }

  async update(
    tripId: string,
    activityId: string,
    userId: string,
    input: UpdateActivityInput
  ) {
    await this._tripsService.assertMember(tripId, userId);
    const activity = await this.loadOne(tripId, activityId);
    if (!activity) {
      throw new HttpErrors.NotFound('Activity not found');
    }

    // Guard the combined range when only one bound is supplied.
    const startAt = input.startAt ? new Date(input.startAt) : activity.startAt;
    const endAt = input.endAt ? new Date(input.endAt) : activity.endAt;
    if (endAt <= startAt) {
      throw new HttpErrors.BadRequest('endAt must be after startAt');
    }

    // Assign null directly so TypeORM clears the column; `undefined` would be
    // treated as "no change" by save().
    if (input.title !== undefined) activity.title = input.title;
    if (input.notes !== undefined) activity.notes = input.notes;
    if (input.color !== undefined) activity.color = input.color;
    if (input.startAt !== undefined) activity.startAt = startAt;
    if (input.endAt !== undefined) activity.endAt = endAt;
    if (input.lat !== undefined) activity.lat = input.lat;
    if (input.lng !== undefined) activity.lng = input.lng;
    if (input.locationLabel !== undefined)
      activity.locationLabel = input.locationLabel;
    if (input.segmentId !== undefined) {
      activity.segment = await this.resolveSegment(tripId, input.segmentId);
    }
    if (input.legendCategoryId !== undefined) {
      activity.legendCategory = await this._legendService.resolveForTrip(
        tripId,
        input.legendCategoryId
      );
    }
    if (input.tagIds !== undefined) {
      activity.tags = await this._tagsService.resolveForTrip(
        tripId,
        input.tagIds
      );
    }

    await this._activityRepository.save(activity);
    const full = await this.loadOne(tripId, activityId);
    return toActivityDto(full ?? activity, tripId);
  }

  async remove(tripId: string, activityId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const activity = await this.loadOne(tripId, activityId);
    if (!activity) {
      throw new HttpErrors.NotFound('Activity not found');
    }
    await this._activityRepository.delete(activity.id);
    return { success: true };
  }
}
