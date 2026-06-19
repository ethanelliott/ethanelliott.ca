import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Activity } from '../activity/activity.entity';
import { Trip } from '../trip/trip.entity';
import { TripsService } from '../trip/trips.service';
import { Expense } from './expense.entity';
import { toExpenseDto } from './mappers';
import { CreateExpenseInput, UpdateExpenseInput } from './expense.types';

export class ExpensesService {
  private readonly _expenseRepository =
    inject(Database).repositoryFor(Expense);
  private readonly _activityRepository =
    inject(Database).repositoryFor(Activity);
  private readonly _tripsService = inject(TripsService);

  /** Validate that an activity (if given) belongs to the trip. */
  private async resolveActivity(
    tripId: string,
    activityId: string | null | undefined
  ): Promise<Activity | null> {
    if (!activityId) return null;
    const activity = await this._activityRepository.findOne({
      where: { id: activityId, trip: { id: tripId } },
    });
    if (!activity) {
      throw new HttpErrors.BadRequest('Activity does not belong to this trip');
    }
    return activity;
  }

  private loadOne(tripId: string, expenseId: string) {
    return this._expenseRepository.findOne({
      where: { id: expenseId, trip: { id: tripId } },
      relations: { activity: true },
    });
  }

  private toCents(amount: number): number {
    return Math.round(amount * 100);
  }

  async list(tripId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const expenses = await this._expenseRepository.find({
      where: { trip: { id: tripId } },
      relations: { activity: true },
      order: { chargeDate: 'ASC', createdAt: 'ASC' },
    });
    return expenses.map((e) => toExpenseDto(e, tripId));
  }

  async create(tripId: string, userId: string, input: CreateExpenseInput) {
    await this._tripsService.assertMember(tripId, userId);
    const activity = await this.resolveActivity(tripId, input.activityId);

    const expense = await this._expenseRepository.save(
      this._expenseRepository.create({
        trip: { id: tripId } as Trip,
        activity,
        item: input.item,
        type: input.type,
        amountCents: this.toCents(input.amount),
        chargeDate: input.chargeDate ?? null,
        paid: input.paid,
      })
    );

    const full = await this.loadOne(tripId, expense.id);
    return toExpenseDto(full ?? expense, tripId);
  }

  async update(
    tripId: string,
    expenseId: string,
    userId: string,
    input: UpdateExpenseInput
  ) {
    await this._tripsService.assertMember(tripId, userId);
    const expense = await this.loadOne(tripId, expenseId);
    if (!expense) {
      throw new HttpErrors.NotFound('Expense not found');
    }

    if (input.item !== undefined) expense.item = input.item;
    if (input.type !== undefined) expense.type = input.type;
    if (input.amount !== undefined) expense.amountCents = this.toCents(input.amount);
    if (input.chargeDate !== undefined) expense.chargeDate = input.chargeDate;
    if (input.paid !== undefined) expense.paid = input.paid;
    if (input.activityId !== undefined) {
      expense.activity = await this.resolveActivity(tripId, input.activityId);
    }

    await this._expenseRepository.save(expense);
    const full = await this.loadOne(tripId, expenseId);
    return toExpenseDto(full ?? expense, tripId);
  }

  async remove(tripId: string, expenseId: string, userId: string) {
    await this._tripsService.assertMember(tripId, userId);
    const expense = await this.loadOne(tripId, expenseId);
    if (!expense) {
      throw new HttpErrors.NotFound('Expense not found');
    }
    await this._expenseRepository.delete(expense.id);
    return { success: true };
  }
}
