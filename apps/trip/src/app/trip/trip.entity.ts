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
import { Segment } from './segment.entity';
import { Stay } from './stay.entity';

@Entity()
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  // IANA timezone the traveller calls "home" — activities are stored in UTC
  // and rendered against this plus each segment's own zone.
  @Column('text', { default: 'America/Toronto' })
  homeTimezone!: string;

  // All budget figures live in this single base currency.
  @Column('text', { default: 'CAD' })
  baseCurrency!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: true })
  createdBy?: User;

  @OneToMany(() => TripMember, (m) => m.trip)
  members!: TripMember[];

  @OneToMany(() => Segment, (s) => s.trip)
  segments!: Segment[];

  @OneToMany(() => Stay, (s) => s.trip)
  stays!: Stay[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity()
@Index(['trip', 'user'], { unique: true })
export class TripMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Trip, (t) => t.members, { onDelete: 'CASCADE' })
  trip!: Trip;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  user!: User;

  // 'owner' can delete the trip and manage members; 'member' can edit content.
  @Column('text', { default: 'member' })
  role!: 'owner' | 'member';

  @CreateDateColumn()
  joinedAt!: Date;
}

provide(ENTITIES, Trip);
provide(ENTITIES, TripMember);
