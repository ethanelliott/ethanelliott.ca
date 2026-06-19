import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { Trip } from './trip.entity';

/**
 * A leg of the trip: a city/place you stay in for a date range, with the
 * hotel and local timezone. These are the column headers of the schedule grid.
 */
@Entity()
export class Segment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, (t) => t.segments, { onDelete: 'CASCADE' })
  trip!: Trip;

  @Column('text')
  city!: string;

  @Column('text', { nullable: true })
  country?: string;

  @Column('text', { nullable: true })
  hotelName?: string;

  // Local IANA timezone for this leg (e.g. 'Europe/Berlin').
  @Column('text', { default: 'UTC' })
  timezone!: string;

  // Inclusive date range, stored as calendar dates (YYYY-MM-DD).
  @Column('date')
  startDate!: string;

  @Column('date')
  endDate!: string;

  // Header colour for the schedule grid.
  @Column('text', { nullable: true })
  color?: string;

  // Ordering of segments within the trip.
  @Column('integer', { default: 0 })
  position!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

provide(ENTITIES, Segment);
