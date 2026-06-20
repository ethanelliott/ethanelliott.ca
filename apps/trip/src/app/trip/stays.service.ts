import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Stay } from './stay.entity';
import { Trip } from './trip.entity';
import { toStayDto } from './mappers';
import { CreateStayInput, UpdateStayInput } from './trip.types';
import { TripsService } from './trips.service';

export class StaysService {
  private readonly _stayRepository = inject(Database).repositoryFor(Stay);
  private readonly _tripsService = inject(TripsService);

  private async loadOwned(
    tripId: string,
    stayId: string,
    userId: string
  ): Promise<Stay> {
    await this._tripsService.assertMember(tripId, userId);
    const stay = await this._stayRepository.findOne({
      where: { id: stayId, trip: { id: tripId } },
    });
    if (!stay) {
      throw new HttpErrors.NotFound('Stay not found');
    }
    return stay;
  }

  async list(tripId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const stays = await this._stayRepository.find({
      where: { trip: { id: tripId } },
      order: { startDate: 'ASC', position: 'ASC' },
    });
    return stays.map((s) => toStayDto(s, tripId));
  }

  async create(tripId: string, userId: string, input: CreateStayInput) {
    await this._tripsService.assertMember(tripId, userId);

    const last = await this._stayRepository.findOne({
      where: { trip: { id: tripId } },
      order: { position: 'DESC' },
    });
    const position = last ? last.position + 1 : 0;

    const stay = await this._stayRepository.save(
      this._stayRepository.create({
        trip: { id: tripId } as Trip,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        color: input.color,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        locationLabel: input.locationLabel ?? null,
        position,
      })
    );

    return toStayDto(stay, tripId);
  }

  async update(
    tripId: string,
    stayId: string,
    userId: string,
    input: UpdateStayInput
  ) {
    const stay = await this.loadOwned(tripId, stayId, userId);

    const startDate = input.startDate ?? stay.startDate;
    const endDate = input.endDate ?? stay.endDate;
    if (startDate > endDate) {
      throw new HttpErrors.BadRequest('startDate must be on or before endDate');
    }

    if (Object.keys(input).length > 0) {
      await this._stayRepository.update(stay.id, input);
    }
    const updated = await this._stayRepository.findOneByOrFail({ id: stay.id });
    return toStayDto(updated, tripId);
  }

  async remove(tripId: string, stayId: string, userId: string) {
    const stay = await this.loadOwned(tripId, stayId, userId);
    await this._stayRepository.delete(stay.id);
    return { success: true };
  }
}
