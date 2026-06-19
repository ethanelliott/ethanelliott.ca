import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Activity,
  CreateActivityRequest,
  CreateTripRequest,
  PublicUser,
  Segment,
  SegmentRequest,
  Tag,
  TagRequest,
  Trip,
  TripSummary,
  UpdateActivityRequest,
  UpdateTripRequest,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  private readonly usersBase = `${environment.apiUrl}/users`;

  // ── Users ──
  searchUsers(q: string): Observable<PublicUser[]> {
    return this.http.get<PublicUser[]>(`${this.usersBase}/search`, {
      params: { q },
    });
  }

  // ── Trips ──
  getTrips(): Observable<TripSummary[]> {
    return this.http.get<TripSummary[]>(`${this.base}/trips`);
  }

  getTrip(id: string): Observable<Trip> {
    return this.http.get<Trip>(`${this.base}/trips/${id}`);
  }

  createTrip(body: CreateTripRequest): Observable<Trip> {
    return this.http.post<Trip>(`${this.base}/trips`, body);
  }

  updateTrip(id: string, body: UpdateTripRequest): Observable<Trip> {
    return this.http.put<Trip>(`${this.base}/trips/${id}`, body);
  }

  deleteTrip(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/trips/${id}`);
  }

  // ── Members ──
  addMember(id: string, username: string): Observable<Trip> {
    return this.http.post<Trip>(`${this.base}/trips/${id}/members`, {
      username,
    });
  }

  removeMember(id: string, userId: string): Observable<Trip> {
    return this.http.delete<Trip>(`${this.base}/trips/${id}/members/${userId}`);
  }

  // ── Segments ──
  createSegment(tripId: string, body: SegmentRequest): Observable<Segment> {
    return this.http.post<Segment>(`${this.base}/trips/${tripId}/segments`, body);
  }

  updateSegment(
    tripId: string,
    segmentId: string,
    body: Partial<SegmentRequest>
  ): Observable<Segment> {
    return this.http.put<Segment>(
      `${this.base}/trips/${tripId}/segments/${segmentId}`,
      body
    );
  }

  deleteSegment(
    tripId: string,
    segmentId: string
  ): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/segments/${segmentId}`
    );
  }

  reorderSegments(tripId: string, segmentIds: string[]): Observable<Segment[]> {
    return this.http.put<Segment[]>(
      `${this.base}/trips/${tripId}/segments/reorder`,
      { segmentIds }
    );
  }

  // ── Tags ──
  getTags(tripId: string): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.base}/trips/${tripId}/tags`);
  }

  createTag(tripId: string, body: TagRequest): Observable<Tag> {
    return this.http.post<Tag>(`${this.base}/trips/${tripId}/tags`, body);
  }

  updateTag(
    tripId: string,
    tagId: string,
    body: Partial<TagRequest>
  ): Observable<Tag> {
    return this.http.put<Tag>(`${this.base}/trips/${tripId}/tags/${tagId}`, body);
  }

  deleteTag(tripId: string, tagId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/tags/${tagId}`
    );
  }

  // ── Activities ──
  getActivities(tripId: string): Observable<Activity[]> {
    return this.http.get<Activity[]>(`${this.base}/trips/${tripId}/activities`);
  }

  createActivity(
    tripId: string,
    body: CreateActivityRequest
  ): Observable<Activity> {
    return this.http.post<Activity>(
      `${this.base}/trips/${tripId}/activities`,
      body
    );
  }

  updateActivity(
    tripId: string,
    activityId: string,
    body: UpdateActivityRequest
  ): Observable<Activity> {
    return this.http.put<Activity>(
      `${this.base}/trips/${tripId}/activities/${activityId}`,
      body
    );
  }

  deleteActivity(
    tripId: string,
    activityId: string
  ): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/activities/${activityId}`
    );
  }
}
