import { inject } from '@ee/di';
import { Database } from '../../data-source';
import { Transaction, TransactionIn } from './transaction';
import { TagsService } from '../tags/tags.service';
import { MediumsService } from '../mediums/mediums.service';
import { CategoriesService } from '../categories/categories.service';
import HttpError from 'http-errors';

export class TransactionsService {
  private readonly _repository = inject(Database).repositoryFor(Transaction);

  private readonly _tagsService = inject(TagsService);
  private readonly _mediumsService = inject(MediumsService);
  private readonly _categoriesService = inject(CategoriesService);

  async all() {
    const transactions = await this._repository.find({
      relations: {
        medium: true,
        category: true,
        tags: true,
      },
    });
    return transactions.map((transaction) => {
      return {
        ...transaction,
        medium: transaction.medium.name,
        category: transaction.category.name,
        tags: transaction.tags.map((tag) => tag.name),
      };
    });
  }

  async new(transaction: TransactionIn) {
    const tags = transaction?.tags
      ? await Promise.all(
          transaction.tags.map((tag) => this._tagsService.new({ name: tag }))
        )
      : [];

    const medium = await this._mediumsService.new({ name: transaction.medium });

    const category = await this._categoriesService.new({
      name: transaction.category,
    });

    const savedTransaction = await this._repository.save({
      ...transaction,
      medium,
      category,
      tags: tags,
    });

    return {
      ...savedTransaction,
      medium: savedTransaction.medium.name,
      category: savedTransaction.category.name,
      tags: savedTransaction.tags.map((tag) => tag.name),
    };
  }

  async findById(id: string) {
    const transaction = await this._repository.findOne({
      where: { id },
      relations: {
        medium: true,
        category: true,
        tags: true,
      },
    });

    if (!transaction) {
      return null;
    }

    return {
      ...transaction,
      medium: transaction.medium.name,
      category: transaction.category.name,
      tags: transaction.tags.map((tag) => tag.name),
    };
  }

  async update(id: string, transaction: TransactionIn) {
    const existing = await this._repository.findOne({
      where: { id },
      relations: {
        medium: true,
        category: true,
        tags: true,
      },
    });

    if (!existing) {
      throw new HttpError.NotFound(`Transaction with id "${id}" not found.`);
    }

    const tags = transaction?.tags
      ? await Promise.all(
          transaction.tags.map((tag) => this._tagsService.new({ name: tag }))
        )
      : [];

    const medium = await this._mediumsService.new({ name: transaction.medium });

    const category = await this._categoriesService.new({
      name: transaction.category,
    });

    // Update the existing entity properties
    existing.type = transaction.type;
    existing.amount = transaction.amount;
    existing.date = transaction.date;
    existing.description = transaction.description;
    existing.medium = medium;
    existing.category = category;
    existing.tags = tags;

    // Save the updated entity (this handles many-to-many relationships correctly)
    await this._repository.save(existing);

    return this.findById(id);
  }

  async deleteById(id: string) {
    const result = await this._repository.delete(id);
    return result.affected !== 0;
  }

  async deleteAll() {
    const result = await this._repository.deleteAll();
    return result.affected || 0;
  }
}
