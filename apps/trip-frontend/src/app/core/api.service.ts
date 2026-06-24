import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Activity,
  CreateActivityRequest,
  CreateExpenseRequest,
  CreateTripRequest,
  Expense,
  LegendCategory,
  LegendCategoryRequest,
  PackingContainer,
  PackingItem,
  PackingList,
  PackingTemplateSummary,
  PublicUser,
  Segment,
  SegmentRequest,
  Stay,
  StayRequest,
  Tag,
  TagRequest,
  Trip,
  TripSummary,
  UpdateActivityRequest,
  UpdateExpenseRequest,
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

  // ── Stays (hotels) ──
  createStay(tripId: string, body: StayRequest): Observable<Stay> {
    return this.http.post<Stay>(`${this.base}/trips/${tripId}/stays`, body);
  }

  updateStay(
    tripId: string,
    stayId: string,
    body: Partial<StayRequest>
  ): Observable<Stay> {
    return this.http.put<Stay>(
      `${this.base}/trips/${tripId}/stays/${stayId}`,
      body
    );
  }

  deleteStay(tripId: string, stayId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/stays/${stayId}`
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

  // ── Legend categories ──
  getLegend(tripId: string): Observable<LegendCategory[]> {
    return this.http.get<LegendCategory[]>(
      `${this.base}/trips/${tripId}/legend`
    );
  }

  createLegendCategory(
    tripId: string,
    body: LegendCategoryRequest
  ): Observable<LegendCategory> {
    return this.http.post<LegendCategory>(
      `${this.base}/trips/${tripId}/legend`,
      body
    );
  }

  updateLegendCategory(
    tripId: string,
    categoryId: string,
    body: Partial<LegendCategoryRequest>
  ): Observable<LegendCategory> {
    return this.http.put<LegendCategory>(
      `${this.base}/trips/${tripId}/legend/${categoryId}`,
      body
    );
  }

  deleteLegendCategory(
    tripId: string,
    categoryId: string
  ): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/legend/${categoryId}`
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

  // ── Expenses ──
  getExpenses(tripId: string): Observable<Expense[]> {
    return this.http.get<Expense[]>(`${this.base}/trips/${tripId}/expenses`);
  }

  createExpense(
    tripId: string,
    body: CreateExpenseRequest
  ): Observable<Expense> {
    return this.http.post<Expense>(`${this.base}/trips/${tripId}/expenses`, body);
  }

  updateExpense(
    tripId: string,
    expenseId: string,
    body: UpdateExpenseRequest
  ): Observable<Expense> {
    return this.http.put<Expense>(
      `${this.base}/trips/${tripId}/expenses/${expenseId}`,
      body
    );
  }

  deleteExpense(
    tripId: string,
    expenseId: string
  ): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/trips/${tripId}/expenses/${expenseId}`
    );
  }

  // ── Packing ──
  getPackingList(tripId: string): Observable<PackingList> {
    return this.http.get<PackingList>(`${this.base}/trips/${tripId}/packing`);
  }

  addContainer(
    tripId: string,
    body: { name: string; color: string }
  ): Observable<PackingList> {
    return this.http.post<PackingList>(
      `${this.base}/trips/${tripId}/packing/containers`,
      body
    );
  }

  updateContainer(
    tripId: string,
    containerId: string,
    body: Partial<Pick<PackingContainer, 'name' | 'color'>>
  ): Observable<PackingList> {
    return this.http.put<PackingList>(
      `${this.base}/trips/${tripId}/packing/containers/${containerId}`,
      body
    );
  }

  deleteContainer(tripId: string, containerId: string): Observable<PackingList> {
    return this.http.delete<PackingList>(
      `${this.base}/trips/${tripId}/packing/containers/${containerId}`
    );
  }

  addPackingItem(
    tripId: string,
    body: { name: string; count?: number; containerId?: string | null }
  ): Observable<PackingList> {
    return this.http.post<PackingList>(
      `${this.base}/trips/${tripId}/packing/items`,
      body
    );
  }

  updatePackingItem(
    tripId: string,
    itemId: string,
    body: Partial<
      Pick<
        PackingItem,
        'name' | 'count' | 'containerId' | 'ready' | 'packed' | 'verify'
      >
    >
  ): Observable<PackingList> {
    return this.http.put<PackingList>(
      `${this.base}/trips/${tripId}/packing/items/${itemId}`,
      body
    );
  }

  deletePackingItem(tripId: string, itemId: string): Observable<PackingList> {
    return this.http.delete<PackingList>(
      `${this.base}/trips/${tripId}/packing/items/${itemId}`
    );
  }

  getPackingTemplates(): Observable<PackingTemplateSummary[]> {
    return this.http.get<PackingTemplateSummary[]>(
      `${this.base}/packing-templates`
    );
  }

  savePackingTemplate(
    tripId: string,
    name: string
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.base}/trips/${tripId}/packing/save-template`,
      { name }
    );
  }

  applyPackingTemplate(
    tripId: string,
    templateId: string
  ): Observable<PackingList> {
    return this.http.post<PackingList>(
      `${this.base}/trips/${tripId}/packing/apply-template`,
      { templateId }
    );
  }

  deletePackingTemplate(templateId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/packing-templates/${templateId}`
    );
  }
}
