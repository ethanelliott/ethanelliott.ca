import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReadingEntity } from './reading.entity';

/** One typed value belonging to a {@link ReadingEntity}. */
@Entity('aranet_measurements')
@Index(['type'])
export class MeasurementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ReadingEntity, (reading) => reading.measurements, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reading_id' })
  reading!: ReadingEntity;

  /** MeasurementType: co2 | radon | temperature | humidity | pressure | battery | status */
  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'double precision' })
  value!: number;
}
