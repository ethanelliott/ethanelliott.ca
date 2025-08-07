import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  name!: string;

  @Column('text')
  username!: string;

  @Column('text')
  passwordHash!: string;
}

export const FullUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export type FullUser = z.infer<typeof FullUserSchema>;

provide(ENTITIES, User);
