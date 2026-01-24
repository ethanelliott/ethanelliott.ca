import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Account, AccountOut, AccountUpdate } from './account.entity';

export class AccountsService {
  private readonly _repository = inject(Database).repositoryFor(Account);

  /**
   * Get all accounts for a user (with institution info)
   */
  async getAll(userId: string): Promise<AccountOut[]> {
    const accounts = await this._repository.find({
      where: { user: { id: userId } },
      relations: { plaidItem: true },
      order: { plaidItem: { institutionName: 'ASC' }, name: 'ASC' },
    });

    return accounts.map((account) => this.mapToOut(account));
  }

  /**
   * Get visible accounts only
   */
  async getVisible(userId: string): Promise<AccountOut[]> {
    const accounts = await this._repository.find({
      where: { user: { id: userId }, isVisible: true },
      relations: { plaidItem: true },
      order: { plaidItem: { institutionName: 'ASC' }, name: 'ASC' },
    });

    return accounts.map((account) => this.mapToOut(account));
  }

  /**
   * Get a specific account
   */
  async getById(accountId: string, userId: string): Promise<AccountOut> {
    const account = await this._repository.findOne({
      where: { id: accountId, user: { id: userId } },
      relations: { plaidItem: true },
    });

    if (!account) {
      throw new HttpErrors.NotFound(`Account not found`);
    }

    return this.mapToOut(account);
  }

  /**
   * Update account settings (visibility)
   */
  async update(
    accountId: string,
    update: AccountUpdate,
    userId: string
  ): Promise<AccountOut> {
    const account = await this._repository.findOne({
      where: { id: accountId, user: { id: userId } },
      relations: { plaidItem: true },
    });

    if (!account) {
      throw new HttpErrors.NotFound(`Account not found`);
    }

    if (update.isVisible !== undefined) {
      account.isVisible = update.isVisible;
    }

    const saved = await this._repository.save(account);
    return this.mapToOut(saved);
  }

  /**
   * Get account summary
   */
  async getSummary(userId: string): Promise<{
    totalAccounts: number;
    visibleAccounts: number;
    totalBalance: number;
    totalAvailable: number;
    byType: Record<string, { count: number; balance: number }>;
  }> {
    const accounts = await this._repository.find({
      where: { user: { id: userId } },
    });

    const visible = accounts.filter((a) => a.isVisible);
    const byType: Record<string, { count: number; balance: number }> = {};

    for (const account of visible) {
      if (!byType[account.type]) {
        byType[account.type] = { count: 0, balance: 0 };
      }
      byType[account.type].count++;
      byType[account.type].balance += account.currentBalance || 0;
    }

    return {
      totalAccounts: accounts.length,
      visibleAccounts: visible.length,
      totalBalance: visible.reduce(
        (sum, a) => sum + (a.currentBalance || 0),
        0
      ),
      totalAvailable: visible.reduce(
        (sum, a) => sum + (a.availableBalance || 0),
        0
      ),
      byType,
    };
  }

  /**
   * Get accounts grouped by institution
   */
  async getByInstitution(userId: string): Promise<
    Array<{
      institutionId: string | null;
      institutionName: string;
      institutionLogo: string | null;
      institutionColor: string | null;
      accounts: AccountOut[];
      totalBalance: number;
    }>
  > {
    const accounts = await this._repository.find({
      where: { user: { id: userId }, isVisible: true },
      relations: { plaidItem: true },
      order: { plaidItem: { institutionName: 'ASC' }, name: 'ASC' },
    });

    const grouped = new Map<
      string,
      {
        institutionId: string | null;
        institutionName: string;
        institutionLogo: string | null;
        institutionColor: string | null;
        accounts: AccountOut[];
        totalBalance: number;
      }
    >();

    for (const account of accounts) {
      const key = account.plaidItem?.institutionId || 'unknown';
      if (!grouped.has(key)) {
        grouped.set(key, {
          institutionId: account.plaidItem?.institutionId || null,
          institutionName: account.plaidItem?.institutionName || 'Unknown',
          institutionLogo: account.plaidItem?.institutionLogo || null,
          institutionColor: account.plaidItem?.institutionColor || null,
          accounts: [],
          totalBalance: 0,
        });
      }
      const group = grouped.get(key)!;
      group.accounts.push(this.mapToOut(account));
      group.totalBalance += account.currentBalance || 0;
    }

    return Array.from(grouped.values());
  }

  private mapToOut(account: Account): AccountOut {
    return {
      id: account.id,
      plaidAccountId: account.plaidAccountId,
      plaidItemId: account.plaidItem?.id || '',
      institutionName: account.plaidItem?.institutionName || null,
      institutionLogo: account.plaidItem?.institutionLogo || null,
      institutionColor: account.plaidItem?.institutionColor || null,
      name: account.name,
      officialName: account.officialName || null,
      type: account.type,
      subtype: account.subtype || null,
      mask: account.mask || null,
      currentBalance: account.currentBalance ?? null,
      availableBalance: account.availableBalance ?? null,
      limitAmount: account.limitAmount ?? null,
      isoCurrencyCode: account.isoCurrencyCode,
      lastBalanceUpdate: account.lastBalanceUpdate || null,
      isVisible: account.isVisible,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
