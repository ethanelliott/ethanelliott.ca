import { Expense } from './expense.entity';
import { ExpenseOut } from './expense.types';

export function toExpenseDto(expense: Expense, tripId: string): ExpenseOut {
  return {
    id: expense.id,
    tripId,
    activityId: expense.activity?.id ?? null,
    activityTitle: expense.activity?.title ?? null,
    item: expense.item,
    type: expense.type,
    amountCents: expense.amountCents,
    chargeDate: expense.chargeDate ?? null,
    paid: expense.paid,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}
