import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Trip } from '../trip/trip.entity';
import { TripsService } from '../trip/trips.service';
import { LegendCategory } from './legend.entity';
import { toLegendCategoryDto } from './mappers';
import {
  CreateLegendCategoryInput,
  UpdateLegendCategoryInput,
} from './activity.types';

export class LegendService {
  private readonly _legendRepository =
    inject(Database).repositoryFor(LegendCategory);
  private readonly _tripsService = inject(TripsService);

  /** Resolve a single legend category by id, scoped to a trip. */
  async resolveForTrip(
    tripId: string,
    categoryId: string | null | undefined
  ): Promise<LegendCategory | null> {
    if (!categoryId) return null;
    const category = await this._legendRepository.findOne({
      where: { id: categoryId, trip: { id: tripId } },
    });
    if (!category) {
      throw new HttpErrors.BadRequest(
        'Legend category does not belong to this trip'
      );
    }
    return category;
  }

  async list(tripId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const categories = await this._legendRepository.find({
      where: { trip: { id: tripId } },
      order: { name: 'ASC' },
    });
    return categories.map(toLegendCategoryDto);
  }

  async create(
    tripId: string,
    userId: string,
    input: CreateLegendCategoryInput
  ) {
    await this._tripsService.assertMember(tripId, userId);
    const existing = await this._legendRepository.findOne({
      where: { trip: { id: tripId }, name: input.name },
    });
    if (existing) {
      throw new HttpErrors.Conflict(
        `A legend category named "${input.name}" already exists`
      );
    }
    const category = await this._legendRepository.save(
      this._legendRepository.create({
        trip: { id: tripId } as Trip,
        name: input.name,
        color: input.color,
      })
    );
    return toLegendCategoryDto(category);
  }

  async update(
    tripId: string,
    categoryId: string,
    userId: string,
    input: UpdateLegendCategoryInput
  ) {
    await this._tripsService.assertMember(tripId, userId);
    const category = await this._legendRepository.findOne({
      where: { id: categoryId, trip: { id: tripId } },
    });
    if (!category) {
      throw new HttpErrors.NotFound('Legend category not found');
    }
    if (Object.keys(input).length > 0) {
      await this._legendRepository.update(category.id, input);
    }
    const updated = await this._legendRepository.findOneByOrFail({
      id: category.id,
    });
    return toLegendCategoryDto(updated);
  }

  async remove(tripId: string, categoryId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const category = await this._legendRepository.findOne({
      where: { id: categoryId, trip: { id: tripId } },
    });
    if (!category) {
      throw new HttpErrors.NotFound('Legend category not found');
    }
    await this._legendRepository.delete(category.id);
    return { success: true };
  }
}
