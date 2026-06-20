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
 * A hotel / place you sleep, spanning a date range. Separate from a Location
 * (Segment) — on a travel day you may change location but the hotel for the
 * night is its own thing. Carries its own map pin.
 */
@Entity()
export class Stay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  trip!: Trip;

  @Column('text')
  name!: string;

  @Column('date')
  startDate!: string;

  @Column('date')
  endDate!: string;

  @Column('text', { nullable: true })
  color?: string | null;

  @Column('double precision', { nullable: true })
  lat?: number | null;

  @Column('double precision', { nullable: true })
  lng?: number | null;

  @Column('text', { nullable: true })
  locationLabel?: string | null;

  @Column('integer', { default: 0 })
  position!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

provide(ENTITIES, Stay);
