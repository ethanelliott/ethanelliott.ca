import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { User } from '../users/user';
import { Group } from './group.entity';

/**
 * A payment from one member to another to settle up a debt.
 * Amount stored as integer cents.
 */
@Entity()
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', eager: true })
  group!: Group;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  fromUser!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  toUser!: User;

  @Column('integer')
  amountCents!: number;

  @Column('text', { default: 'CAD' })
  currency!: string;

  @Column('text', { nullable: true })
  note?: string;

  @Column('timestamp')
  date!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt!: Date;
}

provide(ENTITIES, Settlement);
