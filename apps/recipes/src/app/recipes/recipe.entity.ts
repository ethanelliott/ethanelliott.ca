import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import { Category, CategoryOutSchema } from '../categories/category.entity';
import { Tag, TagOutSchema } from '../tags/tag.entity';
import { Ingredient, IngredientOutSchema } from './ingredient.entity';
import { RecipePhoto, RecipePhotoOutSchema } from './recipe-photo.entity';

@Entity('recipe')
export class Recipe {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  title!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  instructions?: string;

  @Column('integer', { default: 4 })
  servings!: number;

  @Column('integer', { nullable: true })
  prepTimeMinutes?: number;

  @Column('integer', { nullable: true })
  cookTimeMinutes?: number;

  @Column('text', { nullable: true })
  notes?: string;

  @Column('text', { nullable: true })
  source?: string;

  @OneToMany(() => Ingredient, (ingredient) => ingredient.recipe, {
    cascade: true,
    eager: true,
  })
  ingredients!: Ingredient[];

  @OneToMany(() => RecipePhoto, (photo) => photo.recipe, {
    cascade: true,
  })
  photos!: RecipePhoto[];

  @ManyToMany(() => Category, { eager: true })
  @JoinTable({
    name: 'recipe_categories',
    joinColumn: { name: 'recipeId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories!: Category[];

  @ManyToMany(() => Tag, { eager: true })
  @JoinTable({
    name: 'recipe_tags',
    joinColumn: { name: 'recipeId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags!: Tag[];
}

// Zod schemas for input
export const IngredientInSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().max(50),
  notes: z.string().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export type IngredientIn = z.infer<typeof IngredientInSchema>;

export const RecipeInSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  instructions: z.string().optional(),
  servings: z.number().int().positive().default(4),
  prepTimeMinutes: z.number().int().positive().optional(),
  cookTimeMinutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  ingredients: z.array(IngredientInSchema).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export type RecipeIn = z.infer<typeof RecipeInSchema>;

// Output schemas
export const RecipeOutSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  servings: z.number(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  source: z.string().nullable(),
  ingredients: z.array(IngredientOutSchema),
  categories: z.array(CategoryOutSchema),
  tags: z.array(TagOutSchema),
  photos: z.array(RecipePhotoOutSchema).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RecipeOut = z.infer<typeof RecipeOutSchema>;

// Summary schema (for list views, without full ingredients/instructions)
export const RecipeSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  categories: z.array(CategoryOutSchema),
  tags: z.array(TagOutSchema),
  photoCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RecipeSummary = z.infer<typeof RecipeSummarySchema>;

provide(ENTITIES, Recipe);
