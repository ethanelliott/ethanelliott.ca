import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import { Recipe } from './recipe.entity';

@Entity('recipe_photo')
export class RecipePhoto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  filename!: string;

  @Column('text')
  mimeType!: string;

  @Column('blob')
  data!: Buffer;

  @Column('integer', { default: 0 })
  orderIndex!: number;

  @ManyToOne(() => Recipe, (recipe) => recipe.photos, {
    onDelete: 'CASCADE',
  })
  recipe!: Recipe;
}

// Zod schemas (note: data is not included in output, fetched separately)
export const RecipePhotoOutSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  orderIndex: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RecipePhotoOut = z.infer<typeof RecipePhotoOutSchema>;

provide(ENTITIES, RecipePhoto);
