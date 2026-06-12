import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { EntityManager } from 'typeorm';
import { Database } from '../data-source';
import { Wheel, WheelItem, WheelTag } from './wheel.entity';
import {
  CreateWheelInput,
  UpdateWheelInput,
  WheelItemInput,
  WheelOut,
  WheelSummaryOut,
  WheelTagInput,
} from './wheel.types';

export class WheelsService {
  private readonly _db = inject(Database);
  private readonly _wheelRepository = this._db.repositoryFor(Wheel);
  private readonly _itemRepository = this._db.repositoryFor(WheelItem);
  private readonly _tagRepository = this._db.repositoryFor(WheelTag);

  /** Throw unless the wheel exists and belongs to the user; returns it. */
  private async assertOwned(wheelId: string, userId: string): Promise<Wheel> {
    const wheel = await this._wheelRepository.findOne({
      where: { id: wheelId, owner: { id: userId } },
    });
    if (!wheel) {
      throw new HttpErrors.NotFound('Wheel not found');
    }
    return wheel;
  }

  async listForUser(userId: string): Promise<WheelSummaryOut[]> {
    const wheels = await this._wheelRepository.find({
      where: { owner: { id: userId } },
      relations: { items: true, tags: true },
      order: { updatedAt: 'DESC' },
    });

    return wheels.map((w) => ({
      id: w.id,
      name: w.name,
      itemCount: w.items?.length ?? 0,
      tagCount: w.tags?.length ?? 0,
      updatedAt: w.updatedAt,
    }));
  }

  async getOne(userId: string, wheelId: string): Promise<WheelOut> {
    await this.assertOwned(wheelId, userId);
    const wheel = await this._wheelRepository.findOne({
      where: { id: wheelId },
      relations: { items: true, tags: true },
    });
    return this.toDto(wheel as Wheel);
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
    const wheel = await this.assertOwned(wheelId, userId);

    await this._db.dataSource.transaction(async (manager) => {
      wheel.name = input.name.trim();
      await manager.save(wheel);

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
    await this.assertOwned(wheelId, userId);
    await this._wheelRepository.delete({ id: wheelId });
  }

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
            tags: item.tags ?? [],
          })
        )
      );
    }
  }

  private toDto(wheel: Wheel): WheelOut {
    const items = [...(wheel.items ?? [])].sort(
      (a, b) => a.position - b.position
    );
    return {
      id: wheel.id,
      name: wheel.name,
      tags: (wheel.tags ?? []).map((t) => ({ name: t.name, color: t.color })),
      items: items.map((i) => ({ label: i.label, tags: i.tags ?? [] })),
      createdAt: wheel.createdAt,
      updatedAt: wheel.updatedAt,
    };
  }
}
