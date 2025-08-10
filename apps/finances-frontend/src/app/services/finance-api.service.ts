import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Transaction {
  id?: string;
  type: 'INCOME' | 'EXPENSE';
  medium: string;
  date: string;
  amount: number;
  category: string;
  tags: string[];
  description: string;
  timestamp?: Date;
  updatedAt?: Date;
}

export interface Category {
  name: string;
}

export interface Medium {
  name: string;
}

export interface Tag {
  name: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  timestamp: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class FinanceApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080';

  // Transactions
  getAllTransactions(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(
      `${this.baseUrl}/finances/transactions`
    );
  }

  getTransaction(id: string): Observable<Transaction> {
    return this.http.get<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`
    );
  }

  createTransaction(
    transaction: Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>
  ): Observable<Transaction> {
    return this.http.post<Transaction>(
      `${this.baseUrl}/finances/transactions`,
      transaction
    );
  }

  updateTransaction(
    id: string,
    transaction: Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>
  ): Observable<Transaction> {
    return this.http.put<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`,
      transaction
    );
  }

  deleteTransaction(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/transactions/${id}`
    );
  }

  // Categories
  getAllCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/finances/categories`);
  }

  createCategory(category: Category): Observable<Category> {
    return this.http.post<Category>(
      `${this.baseUrl}/finances/categories`,
      category
    );
  }

  deleteCategory(name: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/finances/categories/${name}`);
  }

  // Mediums
  getAllMediums(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/finances/mediums`);
  }

  createMedium(medium: Medium): Observable<Medium> {
    return this.http.post<Medium>(`${this.baseUrl}/finances/mediums`, medium);
  }

  deleteMedium(name: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/finances/mediums/${name}`);
  }

  // Tags
  getAllTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/finances/tags`);
  }

  createTag(tag: Tag): Observable<Tag> {
    return this.http.post<Tag>(`${this.baseUrl}/finances/tags`, tag);
  }

  deleteTag(name: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/finances/tags/${name}`);
  }

  // User Profile
  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/users/profile`);
  }

  updateProfile(updates: { name?: string }): Observable<User> {
    return this.http.put<User>(`${this.baseUrl}/users/profile`, updates);
  }

  deleteAccount(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.baseUrl}/users/profile`
    );
  }

  // Auth
  logout(
    refreshToken?: string
  ): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/users/logout`,
      { refreshToken }
    );
  }
}
