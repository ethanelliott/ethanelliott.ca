import { provide } from '@ee/di';
import { Entity, PrimaryColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';

@Entity()
export class Tag {
  @PrimaryColumn('text')
  name!: string;
}

export const FullTagSchema = z.object({
  name: z.string(),
});

export type FullTag = z.infer<typeof FullTagSchema>;

export const SimpleTagSchema = z.string();

export type SimpleTag = z.infer<typeof SimpleTagSchema>;

provide(ENTITIES, Tag);
