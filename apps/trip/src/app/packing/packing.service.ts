import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { Trip } from '../trip/trip.entity';
import { TripsService } from '../trip/trips.service';
import { User } from '../users/user';
import {
  PackingContainer,
  PackingItem,
  PackingList,
  PackingTemplate,
} from './packing.entity';
import { toListDto } from './mappers';
import {
  CreateContainerInput,
  CreateItemInput,
  UpdateContainerInput,
  UpdateItemInput,
} from './packing.types';

export class PackingService {
  private readonly _listRepository = inject(Database).repositoryFor(PackingList);
  private readonly _containerRepository =
    inject(Database).repositoryFor(PackingContainer);
  private readonly _itemRepository =
    inject(Database).repositoryFor(PackingItem);
  private readonly _templateRepository =
    inject(Database).repositoryFor(PackingTemplate);
  private readonly _tripsService = inject(TripsService);

  /** Find or lazily create the current user's list for the trip. */
  private async getOrCreateList(
    tripId: string,
    userId: string
  ): Promise<PackingList> {
    await this._tripsService.assertMember(tripId, userId);
    let list = await this._listRepository.findOne({
      where: { trip: { id: tripId }, user: { id: userId } },
    });
    if (!list) {
      list = await this._listRepository.save(
        this._listRepository.create({
          trip: { id: tripId } as Trip,
          user: { id: userId } as User,
        })
      );
    }
    return list;
  }

  private loadContainers(listId: string): Promise<PackingContainer[]> {
    return this._containerRepository.find({
      where: { list: { id: listId } },
      order: { position: 'ASC' },
    });
  }

  private loadItems(listId: string): Promise<PackingItem[]> {
    return this._itemRepository.find({
      where: { list: { id: listId } },
      relations: { container: true },
      order: { position: 'ASC' },
    });
  }

  private async dto(list: PackingList, tripId: string) {
    const [containers, items] = await Promise.all([
      this.loadContainers(list.id),
      this.loadItems(list.id),
    ]);
    return toListDto(list, tripId, containers, items);
  }

  async getList(tripId: string, userId: string) {
    const list = await this.getOrCreateList(tripId, userId);
    return this.dto(list, tripId);
  }

  // ── Containers ──
  async addContainer(tripId: string, userId: string, input: CreateContainerInput) {
    const list = await this.getOrCreateList(tripId, userId);
    const last = await this._containerRepository.findOne({
      where: { list: { id: list.id } },
      order: { position: 'DESC' },
    });
    await this._containerRepository.save(
      this._containerRepository.create({
        list,
        name: input.name,
        color: input.color,
        position: last ? last.position + 1 : 0,
      })
    );
    return this.dto(list, tripId);
  }

  async updateContainer(
    tripId: string,
    containerId: string,
    userId: string,
    input: UpdateContainerInput
  ) {
    const list = await this.getOrCreateList(tripId, userId);
    const container = await this._containerRepository.findOne({
      where: { id: containerId, list: { id: list.id } },
    });
    if (!container) throw new HttpErrors.NotFound('Container not found');
    if (Object.keys(input).length > 0) {
      await this._containerRepository.update(container.id, input);
    }
    return this.dto(list, tripId);
  }

  async removeContainer(tripId: string, containerId: string, userId: string) {
    const list = await this.getOrCreateList(tripId, userId);
    const container = await this._containerRepository.findOne({
      where: { id: containerId, list: { id: list.id } },
    });
    if (!container) throw new HttpErrors.NotFound('Container not found');
    await this._containerRepository.delete(container.id);
    return this.dto(list, tripId);
  }

  // ── Items ──
  private async resolveContainer(
    listId: string,
    containerId: string | null | undefined
  ): Promise<PackingContainer | null> {
    if (!containerId) return null;
    const container = await this._containerRepository.findOne({
      where: { id: containerId, list: { id: listId } },
    });
    if (!container) {
      throw new HttpErrors.BadRequest('Container does not belong to this list');
    }
    return container;
  }

  /**
   * Enforce the ready → packed → verify pipeline per changed flag: turning a
   * stage on fills the earlier stages; turning one off clears the later ones.
   */
  private applyStages(
    item: { ready: boolean; packed: boolean; verify: boolean },
    input: { ready?: boolean; packed?: boolean; verify?: boolean }
  ): { ready: boolean; packed: boolean; verify: boolean } {
    let { ready, packed, verify } = item;
    if (input.ready !== undefined) {
      ready = input.ready;
      if (!ready) {
        packed = false;
        verify = false;
      }
    }
    if (input.packed !== undefined) {
      packed = input.packed;
      if (packed) ready = true;
      else verify = false;
    }
    if (input.verify !== undefined) {
      verify = input.verify;
      if (verify) {
        ready = true;
        packed = true;
      }
    }
    return { ready, packed, verify };
  }

  async addItem(tripId: string, userId: string, input: CreateItemInput) {
    const list = await this.getOrCreateList(tripId, userId);
    const container = await this.resolveContainer(list.id, input.containerId);
    const last = await this._itemRepository.findOne({
      where: { list: { id: list.id } },
      order: { position: 'DESC' },
    });
    await this._itemRepository.save(
      this._itemRepository.create({
        list,
        container,
        name: input.name,
        count: input.count,
        position: last ? last.position + 1 : 0,
      })
    );
    return this.dto(list, tripId);
  }

  async updateItem(
    tripId: string,
    itemId: string,
    userId: string,
    input: UpdateItemInput
  ) {
    const list = await this.getOrCreateList(tripId, userId);
    const item = await this._itemRepository.findOne({
      where: { id: itemId, list: { id: list.id } },
      relations: { container: true },
    });
    if (!item) throw new HttpErrors.NotFound('Item not found');

    if (input.name !== undefined) item.name = input.name;
    if (input.count !== undefined) item.count = input.count;
    if (input.containerId !== undefined) {
      item.container = await this.resolveContainer(list.id, input.containerId);
    }

    const stages = this.applyStages(item, {
      ready: input.ready,
      packed: input.packed,
      verify: input.verify,
    });
    item.ready = stages.ready;
    item.packed = stages.packed;
    item.verify = stages.verify;

    await this._itemRepository.save(item);
    return this.dto(list, tripId);
  }

  async removeItem(tripId: string, itemId: string, userId: string) {
    const list = await this.getOrCreateList(tripId, userId);
    const item = await this._itemRepository.findOne({
      where: { id: itemId, list: { id: list.id } },
    });
    if (!item) throw new HttpErrors.NotFound('Item not found');
    await this._itemRepository.delete(item.id);
    return this.dto(list, tripId);
  }

  // ── Templates ──
  async listTemplates(userId: string) {
    const templates = await this._templateRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      containerCount: t.data.containers.length,
      itemCount: t.data.items.length,
      createdAt: t.createdAt,
    }));
  }

  async saveTemplate(tripId: string, userId: string, name: string) {
    const list = await this.getOrCreateList(tripId, userId);
    const [containers, items] = await Promise.all([
      this.loadContainers(list.id),
      this.loadItems(list.id),
    ]);
    await this._templateRepository.save(
      this._templateRepository.create({
        user: { id: userId } as User,
        name,
        data: {
          containers: containers.map((c) => ({ name: c.name, color: c.color })),
          items: items.map((i) => ({
            name: i.name,
            count: i.count,
            containerName: i.container?.name ?? null,
          })),
        },
      })
    );
    return { success: true };
  }

  async deleteTemplate(userId: string, templateId: string) {
    const template = await this._templateRepository.findOne({
      where: { id: templateId, user: { id: userId } },
    });
    if (!template) throw new HttpErrors.NotFound('Template not found');
    await this._templateRepository.delete(template.id);
    return { success: true };
  }

  async applyTemplate(tripId: string, userId: string, templateId: string) {
    const list = await this.getOrCreateList(tripId, userId);
    const template = await this._templateRepository.findOne({
      where: { id: templateId, user: { id: userId } },
    });
    if (!template) throw new HttpErrors.NotFound('Template not found');

    const existingContainers = await this.loadContainers(list.id);
    const byName = new Map<string, PackingContainer>(
      existingContainers.map((c) => [c.name.toLowerCase(), c])
    );
    let pos = existingContainers.length;

    for (const c of template.data.containers) {
      if (byName.has(c.name.toLowerCase())) continue;
      const saved = await this._containerRepository.save(
        this._containerRepository.create({
          list,
          name: c.name,
          color: c.color,
          position: pos++,
        })
      );
      byName.set(c.name.toLowerCase(), saved);
    }

    const lastItem = await this._itemRepository.findOne({
      where: { list: { id: list.id } },
      order: { position: 'DESC' },
    });
    let itemPos = lastItem ? lastItem.position + 1 : 0;

    for (const it of template.data.items) {
      const container = it.containerName
        ? byName.get(it.containerName.toLowerCase()) ?? null
        : null;
      await this._itemRepository.save(
        this._itemRepository.create({
          list,
          container,
          name: it.name,
          count: it.count,
          position: itemPos++,
        })
      );
    }

    return this.dto(list, tripId);
  }
}
