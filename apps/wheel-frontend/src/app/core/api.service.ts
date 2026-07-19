import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PublicUser, SaveWheelRequest, Wheel, WheelSummary } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/wheels`;

  listWheels(): Observable<WheelSummary[]> {
    return this.http.get<WheelSummary[]>(this.base);
  }

  getWheel(id: string): Observable<Wheel> {
    return this.http.get<Wheel>(`${this.base}/${id}`);
  }

  createWheel(body: SaveWheelRequest): Observable<Wheel> {
    return this.http.post<Wheel>(this.base, body);
  }

  saveWheel(id: string, body: SaveWheelRequest): Observable<Wheel> {
    return this.http.put<Wheel>(`${this.base}/${id}`, body);
  }

  deleteWheel(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/${id}`);
  }

  searchUsers(query: string): Observable<PublicUser[]> {
    return this.http.get<PublicUser[]>(`${environment.apiUrl}/users/search`, {
      params: { q: query },
    });
  }

  shareWheel(id: string, username: string): Observable<Wheel> {
    return this.http.post<Wheel>(`${this.base}/${id}/shares`, { username });
  }

  unshareWheel(id: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/${id}/shares/${userId}`
    );
  }
}
