import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Category, CategoryIn, CategoryOut } from './category.entity';

export class CategoriesService {
  private readonly _repository = inject(Database).repositoryFor(Category);

  /**
   * Get all categories
   */
  async getAll(): Promise<CategoryOut[]> {
    const categories = await this._repository.find({
      order: { name: 'ASC' },
    });

    return categories.map((c) => this.mapToOut(c));
  }

  /**
   * Get category by ID
   */
  async getById(categoryId: string): Promise<CategoryOut> {
    const category = await this._repository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    return this.mapToOut(category);
  }

  /**
   * Create a new category
   */
  async create(input: CategoryIn): Promise<CategoryOut> {
    // Check if category already exists
    const existing = await this._repository.findOne({
      where: { name: input.name },
    });

    if (existing) {
      throw new HttpErrors.Conflict(`Category "${input.name}" already exists`);
    }

    const category = this._repository.create(input);
    const saved = await this._repository.save(category);
    return this.mapToOut(saved);
  }

  /**
   * Update a category
   */
  async update(
    categoryId: string,
    input: Partial<CategoryIn>
  ): Promise<CategoryOut> {
    const category = await this._repository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    // Check for name conflict
    if (input.name && input.name !== category.name) {
      const existing = await this._repository.findOne({
        where: { name: input.name },
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
  async delete(categoryId: string): Promise<void> {
    const category = await this._repository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new HttpErrors.NotFound('Category not found');
    }

    await this._repository.remove(category);
  }

  /**
   * Get categories by IDs
   */
  async getByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) return [];

    return this._repository
      .createQueryBuilder('category')
      .whereInIds(ids)
      .getMany();
  }

  private mapToOut(category: Category): CategoryOut {
    return {
      id: category.id,
      name: category.name,
      description: category.description ?? null,
      color: category.color ?? null,
      icon: category.icon ?? null,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
