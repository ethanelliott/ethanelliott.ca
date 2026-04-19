import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ip_records')
export class IpRecordEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  ip!: string;

  @CreateDateColumn()
  checkedAt!: Date;

  @Column({ type: 'boolean', default: false })
  changed!: boolean;

  @Column({ type: 'text', nullable: true })
  previousIp!: string | null;
}
