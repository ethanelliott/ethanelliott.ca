import { provide } from '@ee/di';
import { Entity, PrimaryColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';

@Entity()
export class Medium {
  @PrimaryColumn('text')
  name!: string;
}

export const FullMediumSchema = z.object({
  name: z.string(),
});

export type FullMedium = z.infer<typeof FullMediumSchema>;

export const SimpleMediumSchema = z.string();

export type SimpleMedium = z.infer<typeof SimpleMediumSchema>;

provide(ENTITIES, Medium);
