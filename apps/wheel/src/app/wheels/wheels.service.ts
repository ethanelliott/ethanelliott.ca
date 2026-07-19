import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { EntityManager } from 'typeorm';
import { Database } from '../data-source';
import { User } from '../users/user';
import { Wheel, WheelItem, WheelShare, WheelTag } from './wheel.entity';
import {
  CreateWheelInput,
  UpdateWheelInput,
  WheelItemInput,
  WheelOut,
  WheelSummaryOut,
  WheelTagInput,
} from './wheel.types';

type WheelRole = 'owner' | 'editor';

export class WheelsService {
  private readonly _db = inject(Database);
  private readonly _wheelRepository = this._db.repositoryFor(Wheel);
  private readonly _shareRepository = this._db.repositoryFor(WheelShare);
  private readonly _userRepository = this._db.repositoryFor(User);

  /**
   * Throw unless the wheel exists and the user is its owner or someone it
   * was shared with; returns the wheel (with owner + shares loaded) and the
   * user's role. Shares always grant edit access.
   */
  private async assertAccess(
    wheelId: string,
    userId: string
  ): Promise<{ wheel: Wheel; role: WheelRole }> {
    const wheel = await this._wheelRepository.findOne({
      where: { id: wheelId },
      relations: { owner: true, shares: { user: true } },
    });
    if (wheel) {
      if (wheel.owner.id === userId) {
        return { wheel, role: 'owner' };
      }
      if (wheel.shares?.some((s) => s.user.id === userId)) {
        return { wheel, role: 'editor' };
      }
    }
    // A wheel the user can't see is indistinguishable from a missing one.
    throw new HttpErrors.NotFound('Wheel not found');
  }

  private async assertOwner(wheelId: string, userId: string): Promise<Wheel> {
    const { wheel, role } = await this.assertAccess(wheelId, userId);
    if (role !== 'owner') {
      throw new HttpErrors.Forbidden('Only the wheel owner can do that');
    }
    return wheel;
  }

  async listForUser(userId: string): Promise<WheelSummaryOut[]> {
    const relations = {
      items: true,
      tags: true,
      owner: true,
      shares: { user: true },
    } as const;

    const [owned, shares] = await Promise.all([
      this._wheelRepository.find({
        where: { owner: { id: userId } },
        relations,
      }),
      this._shareRepository.find({
        where: { user: { id: userId } },
        relations: { wheel: relations },
      }),
    ]);

    const summaries = [
      ...owned.map((w) => this.toSummary(w, 'owner' as const)),
      ...shares.map((s) => this.toSummary(s.wheel, 'editor' as const)),
    ];
    return summaries.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  async getOne(userId: string, wheelId: string): Promise<WheelOut> {
    const { role } = await this.assertAccess(wheelId, userId);
    const wheel = await this._wheelRepository.findOne({
      where: { id: wheelId },
      relations: {
        items: true,
        tags: true,
        owner: true,
        shares: { user: true },
      },
    });
    return this.toDto(wheel as Wheel, role);
  }

  async create(userId: string, input: CreateWheelInput): Promise<WheelOut> {
    const wheelId = await this._db.dataSource.transaction(async (manager) => {
      const wheel = manager.create(Wheel, {
        name: input.name.trim(),
        owner: { id: userId } as any,
      });
      const saved = await manager.save(wheel);
      await this.writeContents(
        manager,
        saved,
        input.tags ?? [],
        input.items ?? []
      );
      return saved.id;
    });

    return this.getOne(userId, wheelId);
  }

  async replace(
    userId: string,
    wheelId: string,
    input: UpdateWheelInput
  ): Promise<WheelOut> {
    const { wheel } = await this.assertAccess(wheelId, userId);

    await this._db.dataSource.transaction(async (manager) => {
      wheel.name = input.name.trim();
      await manager.save(Wheel, {
        id: wheel.id,
        name: wheel.name,
      });

      // Replace the wheel's contents wholesale — wheels are small, so a
      // delete-and-recreate keeps the save logic trivially correct.
      const [existingItems, existingTags] = await Promise.all([
        manager.find(WheelItem, { where: { wheel: { id: wheelId } } }),
        manager.find(WheelTag, { where: { wheel: { id: wheelId } } }),
      ]);
      if (existingItems.length > 0) await manager.remove(existingItems);
      if (existingTags.length > 0) await manager.remove(existingTags);

      await this.writeContents(manager, wheel, input.tags, input.items);
    });

    return this.getOne(userId, wheelId);
  }

  async remove(userId: string, wheelId: string): Promise<void> {
    await this.assertOwner(wheelId, userId);
    await this._wheelRepository.delete({ id: wheelId });
  }

  // ── Sharing ──

  /** Share a wheel (edit access) with another user, found by username. */
  async addShare(
    userId: string,
    wheelId: string,
    username: string
  ): Promise<WheelOut> {
    const wheel = await this.assertOwner(wheelId, userId);

    const target = await this._userRepository.findOneBy({
      username: username.trim().toLowerCase(),
    });
    if (!target) {
      throw new HttpErrors.NotFound('No user with that username');
    }
    if (target.id === userId) {
      throw new HttpErrors.BadRequest('You already own this wheel');
    }

    const alreadyShared = wheel.shares?.some((s) => s.user.id === target.id);
    if (!alreadyShared) {
      await this._shareRepository.save(
        this._shareRepository.create({
          wheel: { id: wheelId } as any,
          user: { id: target.id } as any,
        })
      );
    }

    return this.getOne(userId, wheelId);
  }

  /**
   * Remove a user's access. The owner can remove anyone; a collaborator can
   * remove only themselves (i.e. leave the wheel).
   */
  async removeShare(
    userId: string,
    wheelId: string,
    targetUserId: string
  ): Promise<void> {
    const { role } = await this.assertAccess(wheelId, userId);
    if (role !== 'owner' && targetUserId !== userId) {
      throw new HttpErrors.Forbidden(
        'Only the wheel owner can remove other people'
      );
    }

    const share = await this._shareRepository.findOne({
      where: { wheel: { id: wheelId }, user: { id: targetUserId } },
    });
    if (share) {
      await this._shareRepository.remove(share);
    }
  }

  // ── Persistence helpers ──

  /** Persist the tag catalog and ordered items for a wheel. */
  private async writeContents(
    manager: EntityManager,
    wheel: Wheel,
    tags: WheelTagInput[],
    items: WheelItemInput[]
  ): Promise<void> {
    if (tags.length > 0) {
      await manager.save(
        tags.map((t) =>
          manager.create(WheelTag, {
            wheel: { id: wheel.id } as any,
            name: t.name.trim(),
            color: t.color,
          })
        )
      );
    }

    if (items.length > 0) {
      await manager.save(
        items.map((item, index) =>
          manager.create(WheelItem, {
            wheel: { id: wheel.id } as any,
            label: item.label.trim(),
            position: index,
            enabled: item.enabled ?? true,
            tags: item.tags ?? [],
          })
        )
      );
    }
  }

  private toPublicUser(user: User) {
    return { id: user.id, username: user.username ?? null, name: user.name };
  }

  private toSummary(wheel: Wheel, role: WheelRole): WheelSummaryOut {
    return {
      id: wheel.id,
      name: wheel.name,
      itemCount: wheel.items?.length ?? 0,
      tagCount: wheel.tags?.length ?? 0,
      role,
      owner: this.toPublicUser(wheel.owner),
      sharedCount: wheel.shares?.length ?? 0,
      updatedAt: wheel.updatedAt,
    };
  }

  private toDto(wheel: Wheel, role: WheelRole): WheelOut {
    const items = [...(wheel.items ?? [])].sort(
      (a, b) => a.position - b.position
    );
    return {
      id: wheel.id,
      name: wheel.name,
      tags: (wheel.tags ?? []).map((t) => ({ name: t.name, color: t.color })),
      items: items.map((i) => ({
        label: i.label,
        tags: i.tags ?? [],
        enabled: i.enabled ?? true,
      })),
      owner: this.toPublicUser(wheel.owner),
      role,
      sharedWith: (wheel.shares ?? []).map((s) => this.toPublicUser(s.user)),
      createdAt: wheel.createdAt,
      updatedAt: wheel.updatedAt,
    };
  }
}
