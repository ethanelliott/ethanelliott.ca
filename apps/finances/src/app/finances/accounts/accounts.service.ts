import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Account, AccountIn } from './account';
import { Transfer } from '../transfers/transfer';

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
          transfersIn: balance.transfersIn,
          transfersOut: balance.transfersOut,
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
      transfersIn: balance.transfersIn,
      transfersOut: balance.transfersOut,
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
      user: { id: userId } as any,
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
    // Get the account to access initial balance
    const account = await this._repository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new HttpErrors.NotFound(
        `Account with id "${accountId}" not found.`
      );
    }

    // Get balance from transactions
    const transactionBalance = await this.getTransactionBalance(accountId);

    // Get balance from transfers
    const transferBalance = await this.getTransferBalance(accountId);

    // Add initial balance to the calculations
    const initialBalance = parseFloat(account.initialBalance.toString()) || 0;

    return {
      currentBalance:
        initialBalance +
        transactionBalance.currentBalance +
        transferBalance.netTransferAmount,
      totalIncome: transactionBalance.totalIncome,
      totalExpenses: transactionBalance.totalExpenses,
      transfersIn: transferBalance.transfersIn,
      transfersOut: transferBalance.transfersOut,
      initialBalance,
    };
  }

  /**
   * Calculate balance from transfers
   */
  private async getTransferBalance(accountId: string) {
    const transferRepository = this._repository.manager.getRepository(Transfer);

    // Get incoming transfers (to this account)
    const incomingTransfers = await transferRepository.find({
      where: { toAccount: { id: accountId } },
    });

    // Get outgoing transfers (from this account)
    const outgoingTransfers = await transferRepository.find({
      where: { fromAccount: { id: accountId } },
    });

    const transfersIn = incomingTransfers.reduce(
      (sum, transfer) => sum + parseFloat(transfer.amount.toString()),
      0
    );

    const transfersOut = outgoingTransfers.reduce(
      (sum, transfer) => sum + parseFloat(transfer.amount.toString()),
      0
    );

    return {
      transfersIn,
      transfersOut,
      netTransferAmount: transfersIn - transfersOut,
    };
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
    };

    return summary;
  }
}
