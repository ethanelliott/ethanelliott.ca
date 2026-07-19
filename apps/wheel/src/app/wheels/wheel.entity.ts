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
@Index(['owner'])
export class Wheel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  owner!: User;

  @Column('text')
  name!: string;

  @OneToMany(() => WheelItem, (i) => i.wheel)
  items!: WheelItem[];

  @OneToMany(() => WheelTag, (t) => t.wheel)
  tags!: WheelTag[];

  @OneToMany(() => WheelShare, (s) => s.wheel)
  shares!: WheelShare[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * A wheel shared with another user. Shares always grant edit access — that
 * is the only state, so no role column is needed.
 */
@Entity()
@Index(['wheel', 'user'], { unique: true })
export class WheelShare {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Wheel, (w) => w.shares, { onDelete: 'CASCADE' })
  wheel!: Wheel;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;
}

/**
 * The catalog of tags available on a wheel. Tags carry a colour so the UI can
 * render consistent chips. Item membership is stored on the item itself as a
 * list of tag names (see {@link WheelItem.tags}).
 */
@Entity()
export class WheelTag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Wheel, (w) => w.tags, { onDelete: 'CASCADE' })
  wheel!: Wheel;

  @Column('text')
  name!: string;

  @Column('text', { default: '#1b9e77' })
  color!: string;
}

@Entity()
export class WheelItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Wheel, (w) => w.items, { onDelete: 'CASCADE' })
  wheel!: Wheel;

  @Column('text')
  label!: string;

  @Column('integer', { default: 0 })
  position!: number;

  // Archived items keep their place in the list but sit out of the spin.
  @Column('boolean', { default: true })
  enabled!: boolean;

  // Names of the tags applied to this item (references WheelTag.name).
  @Column('simple-array', { default: '' })
  tags!: string[];
}

provide(ENTITIES, Wheel);
provide(ENTITIES, WheelShare);
provide(ENTITIES, WheelTag);
provide(ENTITIES, WheelItem);
