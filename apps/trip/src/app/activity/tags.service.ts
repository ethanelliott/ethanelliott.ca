import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { In } from 'typeorm';
import { Database } from '../data-source';
import { Trip } from '../trip/trip.entity';
import { TripsService } from '../trip/trips.service';
import { Tag } from './tag.entity';
import { toTagDto } from './mappers';
import { CreateTagInput, UpdateTagInput } from './activity.types';

export class TagsService {
  private readonly _tagRepository = inject(Database).repositoryFor(Tag);
  private readonly _tripsService = inject(TripsService);

  /** Resolve tag entities by id, scoped to a trip (ignores unknown ids). */
  async resolveForTrip(tripId: string, tagIds: string[]): Promise<Tag[]> {
    if (!tagIds.length) return [];
    return this._tagRepository.find({
      where: { id: In(tagIds), trip: { id: tripId } },
    });
  }

  async list(tripId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const tags = await this._tagRepository.find({
      where: { trip: { id: tripId } },
      order: { name: 'ASC' },
    });
    return tags.map(toTagDto);
  }

  async create(tripId: string, userId: string, input: CreateTagInput) {
    await this._tripsService.assertMember(tripId, userId);
    const existing = await this._tagRepository.findOne({
      where: { trip: { id: tripId }, name: input.name },
    });
    if (existing) {
      throw new HttpErrors.Conflict(`A tag named "${input.name}" already exists`);
    }
    const tag = await this._tagRepository.save(
      this._tagRepository.create({
        trip: { id: tripId } as Trip,
        name: input.name,
        color: input.color,
      })
    );
    return toTagDto(tag);
  }

  async update(
    tripId: string,
    tagId: string,
    userId: string,
    input: UpdateTagInput
  ) {
    await this._tripsService.assertMember(tripId, userId);
    const tag = await this._tagRepository.findOne({
      where: { id: tagId, trip: { id: tripId } },
    });
    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }
    if (Object.keys(input).length > 0) {
      await this._tagRepository.update(tag.id, input);
    }
    const updated = await this._tagRepository.findOneByOrFail({ id: tag.id });
    return toTagDto(updated);
  }

  async remove(tripId: string, tagId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const tag = await this._tagRepository.findOne({
      where: { id: tagId, trip: { id: tripId } },
    });
    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }
    await this._tagRepository.delete(tag.id);
    return { success: true };
  }
}
