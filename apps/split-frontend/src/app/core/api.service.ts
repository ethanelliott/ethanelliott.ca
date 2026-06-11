import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ActivityItem,
  CreateExpenseRequest,
  CreateSettlementRequest,
  Expense,
  Group,
  GroupBalances,
  GroupSummary,
  Overview,
  PublicUser,
  Settlement,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/split`;
  private readonly usersBase = `${environment.apiUrl}/users`;

  // ── Overview & activity ──
  getOverview(): Observable<Overview> {
    return this.http.get<Overview>(`${this.base}/overview`);
  }

  getActivity(): Observable<ActivityItem[]> {
    return this.http.get<ActivityItem[]>(`${this.base}/activity`);
  }

  // ── Users ──
  searchUsers(q: string): Observable<PublicUser[]> {
    return this.http.get<PublicUser[]>(`${this.usersBase}/search`, {
      params: { q },
    });
  }

  // ── Groups ──
  getGroups(): Observable<GroupSummary[]> {
    return this.http.get<GroupSummary[]>(`${this.base}/groups`);
  }

  getGroup(id: string): Observable<Group> {
    return this.http.get<Group>(`${this.base}/groups/${id}`);
  }

  createGroup(body: {
    name: string;
    description?: string;
    type?: string;
    currency?: string;
    memberUsernames?: string[];
  }): Observable<Group> {
    return this.http.post<Group>(`${this.base}/groups`, body);
  }

  updateGroup(
    id: string,
    body: { name?: string; description?: string; type?: string; currency?: string }
  ): Observable<Group> {
    return this.http.put<Group>(`${this.base}/groups/${id}`, body);
  }

  deleteGroup(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/groups/${id}`);
  }

  getBalances(id: string): Observable<GroupBalances> {
    return this.http.get<GroupBalances>(`${this.base}/groups/${id}/balances`);
  }

  addMember(id: string, username: string): Observable<Group> {
    return this.http.post<Group>(`${this.base}/groups/${id}/members`, {
      username,
    });
  }

  removeMember(id: string, userId: string): Observable<Group> {
    return this.http.delete<Group>(
      `${this.base}/groups/${id}/members/${userId}`
    );
  }

  // ── Expenses ──
  getExpenses(groupId: string): Observable<Expense[]> {
    return this.http.get<Expense[]>(`${this.base}/groups/${groupId}/expenses`);
  }

  createExpense(
    groupId: string,
    body: CreateExpenseRequest
  ): Observable<Expense> {
    return this.http.post<Expense>(
      `${this.base}/groups/${groupId}/expenses`,
      body
    );
  }

  updateExpense(
    expenseId: string,
    body: CreateExpenseRequest
  ): Observable<Expense> {
    return this.http.put<Expense>(`${this.base}/expenses/${expenseId}`, body);
  }

  deleteExpense(expenseId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/expenses/${expenseId}`
    );
  }

  // ── Settlements ──
  getSettlements(groupId: string): Observable<Settlement[]> {
    return this.http.get<Settlement[]>(
      `${this.base}/groups/${groupId}/settlements`
    );
  }

  createSettlement(
    groupId: string,
    body: CreateSettlementRequest
  ): Observable<Settlement> {
    return this.http.post<Settlement>(
      `${this.base}/groups/${groupId}/settlements`,
      body
    );
  }

  deleteSettlement(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/settlements/${id}`
    );
  }
}
