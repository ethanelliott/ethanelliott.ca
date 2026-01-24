import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Tag, TagIn, TagOut } from './tag.entity';
import { Transaction } from './transaction.entity';

export class TagsService {
  private readonly _repository = inject(Database).repositoryFor(Tag);
  private readonly _transactionRepository =
    inject(Database).repositoryFor(Transaction);

  /**
   * Get all tags for a user
   */
  async getAll(userId: string): Promise<TagOut[]> {
    const tags = await this._repository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });

    return tags.map((t) => this.mapToOut(t));
  }

  /**
   * Get tag by ID
   */
  async getById(tagId: string, userId: string): Promise<TagOut> {
    const tag = await this._repository.findOne({
      where: { id: tagId, user: { id: userId } },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    return this.mapToOut(tag);
  }

  /**
   * Get tag by name
   */
  async getByName(name: string, userId: string): Promise<TagOut | null> {
    const tag = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    return tag ? this.mapToOut(tag) : null;
  }

  /**
   * Create a new tag
   */
  async create(input: TagIn, userId: string): Promise<TagOut> {
    // Check if tag already exists
    const existing = await this._repository.findOne({
      where: { name: input.name, user: { id: userId } },
    });

    if (existing) {
      throw new HttpErrors.Conflict(`Tag "${input.name}" already exists`);
    }

    const tag = this._repository.create({
      ...input,
      user: { id: userId } as any,
    });

    const saved = await this._repository.save(tag);
    return this.mapToOut(saved);
  }

  /**
   * Update a tag
   */
  async update(
    tagId: string,
    input: Partial<TagIn>,
    userId: string
  ): Promise<TagOut> {
    const tag = await this._repository.findOne({
      where: { id: tagId, user: { id: userId } },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    // Check for name conflict
    if (input.name && input.name !== tag.name) {
      const existing = await this._repository.findOne({
        where: { name: input.name, user: { id: userId } },
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
  async delete(tagId: string, userId: string): Promise<void> {
    const tag = await this._repository.findOne({
      where: { id: tagId, user: { id: userId } },
    });

    if (!tag) {
      throw new HttpErrors.NotFound('Tag not found');
    }

    await this._repository.remove(tag);
  }

  /**
   * Find or create a tag by name
   */
  async findOrCreate(name: string, userId: string): Promise<Tag> {
    let tag = await this._repository.findOne({
      where: { name, user: { id: userId } },
    });

    if (!tag) {
      tag = this._repository.create({
        name,
        user: { id: userId } as any,
      });
      tag = await this._repository.save(tag);
    }

    return tag;
  }

  /**
   * Get tag usage statistics
   */
  async getUsageStats(
    userId: string
  ): Promise<Array<{ tagId: string; name: string; transactionCount: number }>> {
    // This requires a more complex query due to many-to-many relationship
    const tags = await this._repository.find({
      where: { user: { id: userId } },
    });

    const stats = [];
    for (const tag of tags) {
      const count = await this._transactionRepository
        .createQueryBuilder('t')
        .innerJoin('t.tags', 'tag')
        .where('tag.id = :tagId', { tagId: tag.id })
        .andWhere('t.user.id = :userId', { userId })
        .getCount();

      stats.push({
        tagId: tag.id,
        name: tag.name,
        transactionCount: count,
      });
    }

    return stats.sort((a, b) => b.transactionCount - a.transactionCount);
  }

  private mapToOut(tag: Tag): TagOut {
    return {
      id: tag.id,
      name: tag.name,
      description: tag.description || null,
      color: tag.color || null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }
}
