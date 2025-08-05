import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Category } from './category';

export class CategoriesService {
  private readonly _repository = inject(Database).repositoryFor(Category);

  async all() {
    const categories = await this._repository.find();
    return categories.map((category) => {
      return category.name;
    });
  }

  async deleteAll() {
    return this._repository.clear();
  }

  async get(name: string) {
    const value = await this._repository.findOneBy({ name });

    if (!value) {
      throw new HttpErrors.NotFound(`Category with name "${name}" not found.`);
    }

    return value;
  }

  async new(category: Category) {
    const allCategories = await this._repository.find();

    const existingCategory = allCategories.find(
      (c) => c.name === category.name
    );

    if (existingCategory) {
      return existingCategory;
    }

    return this._repository.save(category);
  }

  async delete(name: string) {
    const category = await this._repository.findOneBy({ name });

    if (!category) {
      throw new HttpErrors.NotFound(`Category with name "${name}" not found.`);
    }

    return this._repository.remove(category);
  }

  update(id: string, category: Category) {
    return this._repository.update(id, category);
  }
}
