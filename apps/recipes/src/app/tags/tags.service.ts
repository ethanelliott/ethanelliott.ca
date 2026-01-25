import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Tag, TagIn, TagOut } from './tag.entity';

export class TagsService {
  private readonly _repository = inject(Database).repositoryFor(Tag);

  /**
   * Get all tags
   */
  async getAll(): Promise<TagOut[]> {
    const tags = await this._repository.find({
      order: { name: 'ASC' },
    });

    return tags.map((t) => this.mapToOut(t));
  }

  /**
   * Get tag by ID
   */
  async getById(tagId: string): Promise<TagOut> {
    const tag = await this._repository.findOne({
      where: { id: tagId },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    return this.mapToOut(tag);
  }

  /**
   * Create a new tag
   */
  async create(input: TagIn): Promise<TagOut> {
    // Check if tag already exists
    const existing = await this._repository.findOne({
      where: { name: input.name },
    });

    if (existing) {
      throw new HttpErrors.Conflict(`Tag "${input.name}" already exists`);
    }

    const tag = this._repository.create(input);
    const saved = await this._repository.save(tag);
    return this.mapToOut(saved);
  }

  /**
   * Update a tag
   */
  async update(tagId: string, input: Partial<TagIn>): Promise<TagOut> {
    const tag = await this._repository.findOne({
      where: { id: tagId },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    // Check for name conflict
    if (input.name && input.name !== tag.name) {
      const existing = await this._repository.findOne({
        where: { name: input.name },
      });

      if (existing) {
        throw new HttpErrors.Conflict(`Tag "${input.name}" already exists`);
      }
    }

    Object.assign(tag, input);
    const saved = await this._repository.save(tag);
    return this.mapToOut(saved);
  }

  /**
   * Delete a tag
   */
  async delete(tagId: string): Promise<void> {
    const tag = await this._repository.findOne({
      where: { id: tagId },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    await this._repository.remove(tag);
  }

  /**
   * Get tags by IDs
   */
  async getByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return [];

    return this._repository.createQueryBuilder('tag').whereInIds(ids).getMany();
  }

  private mapToOut(tag: Tag): TagOut {
    return {
      id: tag.id,
      name: tag.name,
      description: tag.description ?? null,
      color: tag.color ?? null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }
}
