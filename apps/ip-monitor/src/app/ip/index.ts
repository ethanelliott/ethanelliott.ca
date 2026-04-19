import { provide } from '@ee/di';
import { ENTITIES } from '../data-source';
import { IpRecordEntity } from './ip.entity';

provide({ provide: ENTITIES, useValue: IpRecordEntity });
