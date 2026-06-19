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
import { Trip } from '../trip/trip.entity';
import { User } from '../users/user';

/** One packing list per traveller per trip. */
@Entity()
@Index(['trip', 'user'], { unique: true })
export class PackingList {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  trip!: Trip;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  user!: User;

  @OneToMany(() => PackingContainer, (c) => c.list)
  containers!: PackingContainer[];

  @OneToMany(() => PackingItem, (i) => i.list)
  items!: PackingItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** A bag/place to pack into (BODY, DAYPACK, SUITCASE…), per list. */
@Entity()
export class PackingContainer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PackingList, (l) => l.containers, { onDelete: 'CASCADE' })
  list!: PackingList;

  @Column('text')
  name!: string;

  @Column('text', { default: '#4f46e5' })
  color!: string;

  @Column('integer', { default: 0 })
  position!: number;
}

@Entity()
export class PackingItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PackingList, (l) => l.items, { onDelete: 'CASCADE' })
  list!: PackingList;

  @ManyToOne(() => PackingContainer, { onDelete: 'SET NULL', nullable: true })
  container?: PackingContainer | null;

  @Column('text')
  name!: string;

  @Column('integer', { default: 1 })
  count!: number;

  // Strict pipeline: ready → packed → verify.
  @Column('boolean', { default: false })
  ready!: boolean;

  @Column('boolean', { default: false })
  packed!: boolean;

  @Column('boolean', { default: false })
  verify!: boolean;

  @Column('integer', { default: 0 })
  position!: number;
}

/** A reusable snapshot of containers + items, owned by a user. */
@Entity()
export class PackingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column('text')
  name!: string;

  @Column('jsonb')
  data!: {
    containers: { name: string; color: string }[];
    items: { name: string; count: number; containerName: string | null }[];
  };

  @CreateDateColumn()
  createdAt!: Date;
}

provide(ENTITIES, PackingList);
provide(ENTITIES, PackingContainer);
provide(ENTITIES, PackingItem);
provide(ENTITIES, PackingTemplate);
