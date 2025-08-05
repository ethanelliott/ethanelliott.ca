import { provide } from '@ee/di';
import { Entity, PrimaryColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';

@Entity()
export class Category {
  @PrimaryColumn('text')
  name!: string;
}

export const FullCategorySchema = z.object({
  name: z.string(),
});

export type FullCategory = z.infer<typeof FullCategorySchema>;

export const SimpleCategorySchema = z.string();

export type SimpleCategory = z.infer<typeof SimpleCategorySchema>;

provide(ENTITIES, Category);
