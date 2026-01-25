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

@Entity('ingredient')
export class Ingredient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  name!: string;

  @Column('real')
  quantity!: number;

  @Column('text')
  unit!: string;

  @Column('text', { nullable: true })
  notes?: string;

  @Column('integer', { default: 0 })
  orderIndex!: number;

  @ManyToOne(() => Recipe, (recipe) => recipe.ingredients, {
    onDelete: 'CASCADE',
  })
  recipe!: Recipe;
}

// Zod schemas
export const IngredientOutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  notes: z.string().nullable(),
  orderIndex: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IngredientOut = z.infer<typeof IngredientOutSchema>;

provide(ENTITIES, Ingredient);
