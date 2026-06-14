import { provide } from '@ee/di';
import { ENTITIES } from '../data-source';
import { DeviceEntity } from './device.entity';
import { ReadingEntity } from './reading.entity';
import { MeasurementEntity } from './measurement.entity';

provide({ provide: ENTITIES, useValue: DeviceEntity });
provide({ provide: ENTITIES, useValue: ReadingEntity });
provide({ provide: ENTITIES, useValue: MeasurementEntity });
