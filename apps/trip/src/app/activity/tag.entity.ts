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
 * A free-form, per-trip label with a colour. Activities reference tags to
 * drive the schedule's colouring and (later) filtering.
 */
@Entity()
@Index(['trip', 'name'], { unique: true })
export class Tag {
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

provide(ENTITIES, Tag);
