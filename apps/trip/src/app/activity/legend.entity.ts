import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { Trip } from '../trip/trip.entity';

/**
 * A per-trip legend category: a named colour (e.g. "Restaurants" → purple).
 * Activities pick a single legend category, which drives the colour they show
 * on the schedule. Distinct from tags, which are free-form text-only labels.
 */
@Entity()
@Index(['trip', 'name'], { unique: true })
export class LegendCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  trip!: Trip;

  @Column('text')
  name!: string;

  @Column('text', { default: '#4f46e5' })
  color!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

provide(ENTITIES, LegendCategory);
