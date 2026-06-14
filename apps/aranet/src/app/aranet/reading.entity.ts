import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { DeviceEntity } from './device.entity';
import { MeasurementEntity } from './measurement.entity';

/**
 * A single point-in-time sample from a device. Holds the timestamp and the
 * device link; the actual values hang off it as {@link MeasurementEntity} rows.
 */
@Entity('aranet_readings')
@Index(['device', 'measuredAt'])
export class ReadingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DeviceEntity, (device) => device.readings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'device_id' })
  device!: DeviceEntity;

  /** When the device actually took the measurement. */
  @Column({ type: 'timestamptz' })
  measuredAt!: Date;

  /** When we persisted it. */
  @CreateDateColumn()
  recordedAt!: Date;

  @OneToMany(() => MeasurementEntity, (m) => m.reading, { cascade: true })
  measurements!: MeasurementEntity[];
}
