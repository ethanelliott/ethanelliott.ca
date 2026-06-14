import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ReadingEntity } from './reading.entity';

@Entity('aranet_devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** BLE MAC address — the unique identity used while scanning. */
  @Index({ unique: true })
  @Column({ type: 'text' })
  macAddress!: string;

  /** Friendly name, e.g. "Office Aranet4". */
  @Column({ type: 'text' })
  name!: string;

  /** 'co2' | 'radon' — selects how the advertisement is decoded. */
  @Column({ type: 'text' })
  type!: string;

  /** Disabled devices are kept for history but not scanned. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Last time a broadcast from this device was seen. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => ReadingEntity, (reading) => reading.device)
  readings!: ReadingEntity[];
}
