import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import { Segment } from '../trip/segment.entity';
import { Trip } from '../trip/trip.entity';
import { LegendCategory } from './legend.entity';
import { Tag } from './tag.entity';

/**
 * A single scheduled thing on the calendar. Times are stored as UTC instants
 * (timestamptz) and rendered against the trip's home zone plus each segment's
 * local zone. An activity may span midnight / multiple days.
 */
@Entity()
@Index(['trip', 'startAt'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  trip!: Trip;

  // Optional link to the city/stay this activity belongs to.
  @ManyToOne(() => Segment, { onDelete: 'SET NULL', nullable: true })
  segment?: Segment | null;

  @Column('text')
  title!: string;

  @Column('text', { nullable: true })
  notes?: string;

  @Column('timestamptz')
  startAt!: Date;

  @Column('timestamptz')
  endAt!: Date;

  // The legend category drives this activity's colour. Optional: an activity
  // with no category falls back to its custom `color` (or a default).
  @ManyToOne(() => LegendCategory, { onDelete: 'SET NULL', nullable: true })
  legendCategory?: LegendCategory | null;

  // Optional custom colour, used only when no legend category is assigned.
  @Column('text', { nullable: true })
  color?: string | null;

  // Optional pin location for the map.
  @Column('double precision', { nullable: true })
  lat?: number | null;

  @Column('double precision', { nullable: true })
  lng?: number | null;

  @Column('text', { nullable: true })
  locationLabel?: string | null;

  @ManyToMany(() => Tag)
  @JoinTable({ name: 'activity_tags' })
  tags!: Tag[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

provide(ENTITIES, Activity);
