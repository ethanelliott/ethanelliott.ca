import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { Tag, FullTag } from './tag';

export class TagsService {
  private readonly _repository = inject(Database).repositoryFor(Tag);

  async all(userId: string) {
    const tags = await this._repository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });
    return tags.map((tag) => tag.name);
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
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    return value;
  }

  async new(tag: FullTag, userId: string) {
    // Check if tag already exists for this user
    const existing = await this._repository.findOne({
      where: { name: tag.name, user: { id: userId } },
    });

    if (existing) {
      return existing;
    }

    const newTag = await this._repository.save({
      ...tag,
      user: { id: userId } as any,
    });

    return newTag;
  }

  async delete(name: string, userId: string) {
    const tag = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!tag) {
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    // Store the tag data before removal since remove() will set id to undefined
    const tagData = { ...tag };
    await this._repository.remove(tag);
    return tagData;
  }

  async update(name: string, tag: FullTag, userId: string) {
    const existingTag = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!existingTag) {
      throw new HttpErrors.NotFound(`Tag with name "${name}" not found.`);
    }

    // Check if new name conflicts with another tag
    if (tag.name !== existingTag.name) {
      const nameConflict = await this._repository.findOne({
        where: { name: tag.name, user: { id: userId } },
      });

      if (nameConflict) {
        throw new HttpErrors.Conflict(
          `Tag with name "${tag.name}" already exists.`
        );
      }
    }

    Object.assign(existingTag, tag);
    return this._repository.save(existingTag);
  }
}
