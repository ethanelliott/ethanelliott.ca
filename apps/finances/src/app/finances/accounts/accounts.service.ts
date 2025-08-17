import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Account, AccountIn } from './account';

export class AccountsService {
  private readonly _repository = inject(Database).repositoryFor(Account);

  async all(userId: string) {
    const accounts = await this._repository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });

    // Get balance for each account
    const accountsWithBalance = await Promise.all(
      accounts.map(async (account) => {
        const balance = await this.getAccountBalance(account.id);
        return {
          ...account,
          currentBalance: balance.currentBalance,
          totalIncome: balance.totalIncome,
          totalExpenses: balance.totalExpenses,
        };
      })
    );

    return accountsWithBalance;
  }

  async deleteAll(userId: string) {
    const result = await this._repository.delete({ user: { id: userId } });
    return { deletedCount: result.affected || 0 };
  }

  async get(id: string, userId: string) {
    const account = await this._repository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!account) {
      throw new HttpErrors.NotFound(`Account with id "${id}" not found.`);
    }

    const balance = await this.getAccountBalance(id);
    return {
      ...account,
      currentBalance: balance.currentBalance,
      totalIncome: balance.totalIncome,
      totalExpenses: balance.totalExpenses,
    };
  }

  async new(account: AccountIn, userId: string) {
    // Check if account name already exists for this user
    const existing = await this._repository.findOne({
      where: { name: account.name, user: { id: userId } },
    });

    if (existing) {
      return existing;
    }

    const newAccount = await this._repository.save({
      ...account,
      userId,
    });

    return newAccount;
  }

  async delete(id: string, userId: string) {
    const account = await this._repository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!account) {
      throw new HttpErrors.NotFound(`Account with id "${id}" not found.`);
    }

    // TODO: Check if account has transactions once TransactionService is updated
    // For now, allow deletion
    await this._repository.remove(account);
    return { success: true };
  }

  async update(id: string, account: AccountIn, userId: string) {
    const existing = await this._repository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!existing) {
      throw new HttpErrors.NotFound(`Account with id "${id}" not found.`);
    }

    // Check if new name conflicts with another account
    if (account.name !== existing.name) {
      const nameConflict = await this._repository.findOne({
        where: { name: account.name, user: { id: userId } },
      });

      if (nameConflict && nameConflict.id !== id) {
        throw new HttpErrors.Conflict(
          `Account with name "${account.name}" already exists.`
        );
      }
    }

    Object.assign(existing, account);
    const updated = await this._repository.save(existing);

    const balance = await this.getAccountBalance(id);
    return {
      ...updated,
      currentBalance: balance.currentBalance,
      totalIncome: balance.totalIncome,
      totalExpenses: balance.totalExpenses,
    };
  }

  /**
   * Calculate account balance from transactions and transfers
   */
  async getAccountBalance(accountId: string) {
    // Get balance from transactions
    const transactionBalance = await this.getTransactionBalance(accountId);

    // TODO: Add transfer balance calculation once TransfersService is integrated
    // For now, just return transaction balance
    return transactionBalance;
  }

  /**
   * Calculate balance from transactions only
   */
  private async getTransactionBalance(accountId: string) {
    const queryBuilder = this._repository.manager
      .createQueryBuilder()
      .select('transaction')
      .from('transaction', 'transaction')
      .where('transaction.accountId = :accountId', { accountId });

    const transactions = await queryBuilder.getMany();

    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach((transaction: any) => {
      if (transaction.type === 'INCOME') {
        totalIncome += parseFloat(transaction.amount);
      } else if (transaction.type === 'EXPENSE') {
        totalExpenses += parseFloat(transaction.amount);
      }
    });

    return {
      currentBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
    };
  }

  async getAccountsByType(userId: string) {
    return this._repository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });
  }

  async getUserAccountSummary(userId: string) {
    const accounts = await this.all(userId);

    const summary = {
      totalAccounts: accounts.length,
      totalBalance: accounts.reduce(
        (sum, acc) => sum + (acc.currentBalance || 0),
        0
      ),
      accountsByType: {} as Record<string, number>,
    };

    accounts.forEach((account) => {
      summary.accountsByType[account.accountType] =
        (summary.accountsByType[account.accountType] || 0) + 1;
    });

    return summary;
  }
}
