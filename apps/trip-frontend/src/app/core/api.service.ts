import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PublicUser } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly usersBase = `${environment.apiUrl}/users`;

  // ── Users ──
  searchUsers(q: string): Observable<PublicUser[]> {
    return this.http.get<PublicUser[]>(`${this.usersBase}/search`, {
      params: { q },
    });
  }

  // Trip / segment / activity / expense endpoints are added in step 2.
}
