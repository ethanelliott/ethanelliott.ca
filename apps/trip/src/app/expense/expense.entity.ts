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
import { Activity } from '../activity/activity.entity';
import { Trip } from '../trip/trip.entity';

/**
 * A budget line. Stored in the trip's base currency as integer cents (negative
 * for credits). Optionally linked to an activity — many expenses may point at
 * the same activity, and standalone expenses (no activity) are allowed.
 */
@Entity()
@Index(['trip', 'chargeDate'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  trip!: Trip;

  @ManyToOne(() => Activity, { onDelete: 'SET NULL', nullable: true })
  activity?: Activity | null;

  @Column('text')
  item!: string;

  // Free-form category (FLIGHT, HOTEL, TRANSPORT, TOUR, ATTRACTION, CREDIT…).
  @Column('text', { default: 'OTHER' })
  type!: string;

  // Amount in base-currency cents; negative represents a credit.
  @Column('integer')
  amountCents!: number;

  // Calendar date the charge hits the account (YYYY-MM-DD), optional.
  @Column('date', { nullable: true })
  chargeDate?: string | null;

  @Column('boolean', { default: false })
  paid!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

provide(ENTITIES, Expense);
