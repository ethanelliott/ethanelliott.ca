import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Device, MeasurementType, Reading, SeriesPage } from './models';

/** Base URL of the aranet backend. CORS is open on the API. */
export const API_BASE = 'https://aranet.elliott.haus';

@Injectable({ providedIn: 'root' })
export class SensorApi {
  private readonly http = inject(HttpClient);

  /** Latest reading (with measurements) per device. */
  latest(): Observable<Reading[]> {
    return this.http.get<Reading[]>(`${API_BASE}/aranet`);
  }

  devices(): Observable<Device[]> {
    return this.http.get<Device[]>(`${API_BASE}/aranet/devices`);
  }

  /** Flat {t, v} series for one metric over the last `hours`. */
  series(
    deviceId: string,
    type: MeasurementType,
    hours: number,
    limit = 5000
  ): Observable<SeriesPage> {
    const params = new HttpParams()
      .set('type', type)
      .set('hours', String(hours))
      .set('limit', String(limit));
    return this.http.get<SeriesPage>(
      `${API_BASE}/aranet/devices/${deviceId}/series`,
      { params }
    );
  }
}
