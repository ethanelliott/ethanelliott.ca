import { PackingContainer, PackingItem, PackingList } from './packing.entity';
import { PackingListOut } from './packing.types';

export function toContainerDto(c: PackingContainer) {
  return { id: c.id, name: c.name, color: c.color, position: c.position };
}

export function toItemDto(i: PackingItem) {
  return {
    id: i.id,
    containerId: i.container?.id ?? null,
    name: i.name,
    count: i.count,
    ready: i.ready,
    packed: i.packed,
    verify: i.verify,
    position: i.position,
  };
}

export function toListDto(
  list: PackingList,
  tripId: string,
  containers: PackingContainer[],
  items: PackingItem[]
): PackingListOut {
  return {
    id: list.id,
    tripId,
    containers: containers.map(toContainerDto),
    items: items.map(toItemDto),
  };
}
