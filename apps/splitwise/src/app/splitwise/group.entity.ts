import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { User } from '../users/user';

@Entity()
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  // Free-form group type / emoji like Splitwise (trip, home, couple, other)
  @Column('text', { default: 'other' })
  type!: string;

  @Column('text', { default: 'USD' })
  currency!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: true })
  createdBy?: User;

  @OneToMany(() => GroupMember, (m) => m.group)
  members!: GroupMember[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity()
@Index(['group', 'user'], { unique: true })
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, (g) => g.members, { onDelete: 'CASCADE' })
  group!: Group;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  user!: User;

  @CreateDateColumn()
  joinedAt!: Date;
}

provide(ENTITIES, Group);
provide(ENTITIES, GroupMember);
