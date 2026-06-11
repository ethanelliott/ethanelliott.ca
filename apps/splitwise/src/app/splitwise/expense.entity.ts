import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { User } from '../users/user';
import { Group } from './group.entity';

export type SplitType = 'equal' | 'exact' | 'percentage';

/**
 * An expense within a group. All monetary values are stored as integer cents
 * to avoid floating-point rounding issues.
 */
@Entity()
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', eager: true })
  group!: Group;

  @Column('text')
  description!: string;

  @Column('integer')
  amountCents!: number;

  @Column('text', { default: 'USD' })
  currency!: string;

  @Column('text', { nullable: true })
  category?: string;

  // The member who paid for the expense
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  paidBy!: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  createdBy?: User;

  @Column('text', { default: 'equal' })
  splitType!: SplitType;

  @Column('timestamp')
  date!: Date;

  @OneToMany(() => ExpenseSplit, (s) => s.expense, {
    cascade: true,
    eager: true,
    orphanedRowAction: 'delete',
  })
  splits!: ExpenseSplit[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * How much a single member owes for a given expense (their share).
 */
@Entity()
export class ExpenseSplit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, (e) => e.splits, { onDelete: 'CASCADE' })
  expense!: Expense;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  user!: User;

  @Column('integer')
  amountCents!: number;
}

provide(ENTITIES, Expense);
provide(ENTITIES, ExpenseSplit);
