import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Tag, FullTag } from './tag';

export class TagsService {
  private readonly _repository = inject(Database).repositoryFor(Tag);

  async all() {
    const tags = await this._repository.find();
    return tags.map((tag) => {
      return tag.name;
    });
  }

  async get(name: string) {
    const value = await this._repository.findOneBy({ name });

    if (!value) {
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    return value;
  }

  async new(tag: Tag) {
    const allTags = await this._repository.find();

    const existingTag = allTags.find((c) => c.name === tag.name);

    if (existingTag) {
      return existingTag;
    }

    return this._repository.save(tag);
  }

  async delete(name: string) {
    const tag = await this._repository.findOneBy({ name });

    if (!tag) {
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    return this._repository.remove(tag);
  }

  async update(name: string, tag: Tag) {
    const existingTag = await this._repository.findOneBy({ name });

    if (!existingTag) {
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    // Update the tag
    await this._repository.update({ name }, tag);

    // Return the updated tag
    return this.get(name);
  }
}
