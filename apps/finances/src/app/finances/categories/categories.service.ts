import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Category, FullCategory } from './category';

export class CategoriesService {
  private readonly _repository = inject(Database).repositoryFor(Category);

  async all(userId: string) {
    const categories = await this._repository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });
    return categories.map((category) => category.name);
  }

  async deleteAll(userId: string) {
    const result = await this._repository.delete({ user: { id: userId } });
    return { deletedCount: result.affected || 0 };
  }

  async get(name: string, userId: string) {
    const value = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!value) {
      throw new HttpErrors.NotFound(`Category with name "${name}" not found.`);
    }

    return value;
  }

  async new(category: FullCategory, userId: string) {
    // Check if category already exists for this user
    const existing = await this._repository.findOne({
      where: { name: category.name, user: { id: userId } },
    });

    if (existing) {
      return existing;
    }

    const newCategory = await this._repository.save({
      ...category,
      user: { id: userId } as any,
    });

    return newCategory;
  }

  async delete(name: string, userId: string) {
    const category = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!category) {
      throw new HttpErrors.NotFound(`Category with name "${name}" not found.`);
    }

    return this._repository.remove(category);
  }

  async update(name: string, category: FullCategory, userId: string) {
    const existingCategory = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!existingCategory) {
      throw new HttpErrors.NotFound(`Category with name "${name}" not found.`);
    }

    // Check if new name conflicts with another category
    if (category.name !== existingCategory.name) {
      const nameConflict = await this._repository.findOne({
        where: { name: category.name, user: { id: userId } },
      });

      if (nameConflict) {
        throw new HttpErrors.Conflict(
          `Category with name "${category.name}" already exists.`
        );
      }
    }

    Object.assign(existingCategory, category);
    return this._repository.save(existingCategory);
  }
}
