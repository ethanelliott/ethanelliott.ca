import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Medium } from './medium';

export class MediumsService {
  private readonly _repository = inject(Database).repositoryFor(Medium);

  async all() {
    const mediums = await this._repository.find();
    return mediums.map((medium) => {
      return medium.name;
    });
  }

  async deleteAll() {
    return this._repository.clear();
  }

  async get(name: string) {
    const value = await this._repository.findOneBy({ name });

    if (!value) {
      throw new HttpErrors.NotFound(`Medium with name "${name}" not found.`);
    }

    return value;
  }

  async new(medium: Medium) {
    const allMediums = await this._repository.find();

    const existingMedium = allMediums.find((c) => c.name === medium.name);

    if (existingMedium) {
      return existingMedium;
    }

    return this._repository.save(medium);
  }

  async delete(name: string) {
    const Medium = await this._repository.findOneBy({ name });

    if (!Medium) {
      throw new HttpErrors.NotFound(`Medium with name "${name}" not found.`);
    }

    return this._repository.remove(Medium);
  }

  async update(name: string, medium: Medium) {
    const existingMedium = await this._repository.findOneBy({ name });

    if (!existingMedium) {
      throw new HttpErrors.NotFound(`Medium with name "${name}" not found.`);
    }

    // Update the medium
    await this._repository.update({ name }, medium);

    // Return the updated medium
    return this.get(name);
  }
}
