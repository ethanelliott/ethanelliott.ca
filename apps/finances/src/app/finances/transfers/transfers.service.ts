import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { Transfer, TransferIn } from './transfer';

export class TransfersService {
  private readonly _repository = inject(Database).repositoryFor(Transfer);
  private readonly _accountsService = inject(AccountsService);
  // private readonly _categoriesService = inject(CategoriesService);

  async all(userId: string) {
    const transfers = await this._repository.find({
      where: { user: { id: userId } },
      relations: {
        fromAccount: true,
        toAccount: true,
        category: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });

    return transfers.map((transfer) => {
      return {
        ...transfer,
        fromAccount: {
          id: transfer.fromAccount.id,
          name: transfer.fromAccount.name,
          accountType: transfer.fromAccount.accountType,
        },
        toAccount: {
          id: transfer.toAccount.id,
          name: transfer.toAccount.name,
          accountType: transfer.toAccount.accountType,
        },
        category: transfer.category?.name,
      };
    });
  }

  async deleteAll(userId: string) {
    const result = await this._repository.delete({ user: { id: userId } });
    return { deletedCount: result.affected || 0 };
  }

  async get(id: string, userId: string) {
    const transfer = await this._repository.findOne({
      where: { id, user: { id: userId } },
      relations: {
        fromAccount: true,
        toAccount: true,
        category: true,
      },
    });

    if (!transfer) {
      throw new HttpErrors.NotFound(`Transfer with id "${id}" not found.`);
    }

    return {
      ...transfer,
      fromAccount: {
        id: transfer.fromAccount.id,
        name: transfer.fromAccount.name,
        accountType: transfer.fromAccount.accountType,
      },
      toAccount: {
        id: transfer.toAccount.id,
        name: transfer.toAccount.name,
        accountType: transfer.toAccount.accountType,
      },
      category: transfer.category?.name,
    };
  }

  async new(transfer: TransferIn, userId: string) {
    // Validate accounts exist and belong to user
    const fromAccount = await this._accountsService.get(
      transfer.fromAccountId,
      userId
    );
    const toAccount = await this._accountsService.get(
      transfer.toAccountId,
      userId
    );

    if (transfer.fromAccountId === transfer.toAccountId) {
      throw new HttpErrors.BadRequest(
        'From and to accounts cannot be the same.'
      );
    }

    // Handle category if provided
    // let category;
    // if (transfer.categoryName) {
    //   category = await this._categoriesService.new(
    //     { name: transfer.categoryName, isActive: true },
    //     userId
    //   );
    // }

    const savedTransfer = await this._repository.save({
      ...transfer,
      userId,
      fromAccount,
      toAccount,
    });

    return this.get(savedTransfer.id, userId);
  }

  async findById(id: string, userId: string) {
    return this.get(id, userId);
  }

  async update(id: string, transfer: TransferIn, userId: string) {
    const existing = await this._repository.findOne({
      where: { id, user: { id: userId } },
      relations: {
        fromAccount: true,
        toAccount: true,
        category: true,
      },
    });

    if (!existing) {
      throw new HttpErrors.NotFound(`Transfer with id "${id}" not found.`);
    }

    // Validate accounts exist and belong to user
    const fromAccount = await this._accountsService.get(
      transfer.fromAccountId,
      userId
    );
    const toAccount = await this._accountsService.get(
      transfer.toAccountId,
      userId
    );

    if (transfer.fromAccountId === transfer.toAccountId) {
      throw new HttpErrors.BadRequest(
        'From and to accounts cannot be the same.'
      );
    }

    // // Handle category if provided
    // let category;
    // if (transfer.categoryName) {
    //   category = await this._categoriesService.new(
    //     { name: transfer., isActive: true },
    //     userId
    //   );
    // }

    // Update the existing entity properties
    existing.transferType = transfer.transferType;
    existing.fromAccount = fromAccount;
    existing.toAccount = toAccount;
    existing.date = transfer.date;
    existing.amount = transfer.amount;
    // existing.category = ;
    existing.description = transfer.description;

    // Save the updated entity
    await this._repository.save(existing);

    return this.findById(id, userId);
  }

  async deleteById(id: string, userId: string) {
    const transfer = await this._repository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!transfer) {
      return false;
    }

    await this._repository.remove(transfer);
    return true;
  }

  async getTransfersByAccount(accountId: string, userId: string) {
    const transfers = await this._repository.find({
      where: [
        { fromAccount: { id: accountId }, user: { id: userId } },
        { toAccount: { id: accountId }, user: { id: userId } },
      ],
      relations: {
        fromAccount: true,
        toAccount: true,
        category: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });

    return transfers.map((transfer) => {
      return {
        ...transfer,
        fromAccount: {
          id: transfer.fromAccount.id,
          name: transfer.fromAccount.name,
          accountType: transfer.fromAccount.accountType,
        },
        toAccount: {
          id: transfer.toAccount.id,
          name: transfer.toAccount.name,
          accountType: transfer.toAccount.accountType,
        },
        category: transfer.category?.name,
      };
    });
  }
}
