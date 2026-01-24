import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Category, CategoryIn, CategoryOut } from './category.entity';
import { Transaction } from './transaction.entity';

// Default categories that will be seeded for new users
export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', color: '#FF6B6B', icon: 'restaurant' },
  { name: 'Shopping', color: '#4ECDC4', icon: 'shopping_bag' },
  { name: 'Transportation', color: '#45B7D1', icon: 'directions_car' },
  { name: 'Bills & Utilities', color: '#96CEB4', icon: 'receipt' },
  { name: 'Entertainment', color: '#DDA0DD', icon: 'movie' },
  { name: 'Health & Fitness', color: '#98D8C8', icon: 'fitness_center' },
  { name: 'Travel', color: '#F7DC6F', icon: 'flight' },
  { name: 'Income', color: '#82E0AA', icon: 'attach_money' },
  { name: 'Transfer', color: '#85C1E9', icon: 'swap_horiz' },
  { name: 'Other', color: '#AEB6BF', icon: 'more_horiz' },
];

export class CategoriesService {
  private readonly _repository = inject(Database).repositoryFor(Category);
  private readonly _transactionRepository =
    inject(Database).repositoryFor(Transaction);

  /**
   * Get all categories for a user
   */
  async getAll(userId: string): Promise<CategoryOut[]> {
    const categories = await this._repository.find({
      where: { user: { id: userId } },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return categories.map((c) => this.mapToOut(c));
  }

  /**
   * Get category by ID
   */
  async getById(categoryId: string, userId: string): Promise<CategoryOut> {
    const category = await this._repository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    return this.mapToOut(category);
  }

  /**
   * Get category by name
   */
  async getByName(name: string, userId: string): Promise<CategoryOut | null> {
    const category = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    return category ? this.mapToOut(category) : null;
  }

  /**
   * Create a new category
   */
  async create(input: CategoryIn, userId: string): Promise<CategoryOut> {
    // Check if category already exists
    const existing = await this._repository.findOne({
      where: { name: input.name, user: { id: userId } },
    });

    if (existing) {
      throw new HttpErrors.Conflict(`Category "${input.name}" already exists`);
    }

    const category = this._repository.create({
      ...input,
      user: { id: userId } as any,
    });

    const saved = await this._repository.save(category);
    return this.mapToOut(saved);
  }

  /**
   * Update a category
   */
  async update(
    categoryId: string,
    input: Partial<CategoryIn>,
    userId: string
  ): Promise<CategoryOut> {
    const category = await this._repository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    // Check for name conflict
    if (input.name && input.name !== category.name) {
      const existing = await this._repository.findOne({
        where: { name: input.name, user: { id: userId } },
      });

      if (existing) {
        throw new HttpErrors.Conflict(
          `Category "${input.name}" already exists`
        );
      }
    }

    Object.assign(category, input);
    const saved = await this._repository.save(category);
    return this.mapToOut(saved);
  }

  /**
   * Delete a category
   */
  async delete(categoryId: string, userId: string): Promise<void> {
    const category = await this._repository.findOne({
      where: { id: categoryId, user: { id: userId } },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    // Check if category is in use
    const usageCount = await this._transactionRepository.count({
      where: { category: { id: categoryId }, user: { id: userId } },
    });

    if (usageCount > 0) {
      throw new HttpErrors.Conflict(
        `Cannot delete category "${category.name}" because it is used by ${usageCount} transactions`
      );
    }

    await this._repository.remove(category);
  }

  /**
   * Find or create a category by name
   */
  async findOrCreate(name: string, userId: string): Promise<Category> {
    let category = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!category) {
      category = this._repository.create({
        name,
        user: { id: userId } as any,
      });
      category = await this._repository.save(category);
    }

    return category;
  }

  /**
   * Seed default categories for a new user
   */
  async seedDefaults(userId: string): Promise<number> {
    let createdCount = 0;

    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i];
      const existing = await this._repository.findOne({
        where: { name: cat.name, user: { id: userId } },
      });

      if (!existing) {
        await this._repository.save({
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          sortOrder: i,
          isSystem: true,
          user: { id: userId } as any,
        });
        createdCount++;
      }
    }

    return createdCount;
  }

  /**
   * Get category usage statistics
   */
  async getUsageStats(
    userId: string
  ): Promise<
    Array<{ categoryId: string; name: string; transactionCount: number }>
  > {
    const categories = await this._repository.find({
      where: { user: { id: userId } },
    });

    const stats = [];
    for (const category of categories) {
      const count = await this._transactionRepository.count({
        where: { category: { id: category.id }, user: { id: userId } },
      });
      stats.push({
        categoryId: category.id,
        name: category.name,
        transactionCount: count,
      });
    }

    return stats.sort((a, b) => b.transactionCount - a.transactionCount);
  }

  private mapToOut(category: Category): CategoryOut {
    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      color: category.color || null,
      icon: category.icon || null,
      plaidCategoryMapping: category.plaidCategoryMapping || null,
      sortOrder: category.sortOrder,
      isSystem: category.isSystem,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
