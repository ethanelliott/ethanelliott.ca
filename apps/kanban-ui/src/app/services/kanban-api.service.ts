import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  TaskOut,
  TaskIn,
  TaskPatch,
  TaskState,
  TaskListFilters,
  BatchCreate,
} from '../models/task.model';
import { TaskDependencyOut } from '../models/task-dependency.model';
import { ActivityEntryOut, ActivityCommentIn } from '../models/activity.model';
import { HistoryResponse } from '../models/history.model';
import { ProjectSummary } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class KanbanApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // ------------------------------------------------------------------ tasks

  listTasks(filters?: TaskListFilters): Observable<TaskOut[]> {
    let params = new HttpParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params = params.set(key, String(value));
        }
      }
    }
    return this.http.get<TaskOut[]>(`${this.base}/tasks`, { params });
  }

  getTask(id: string): Observable<TaskOut> {
    return this.http.get<TaskOut>(`${this.base}/tasks/${id}`);
  }

  createTask(body: TaskIn): Observable<TaskOut> {
    return this.http.post<TaskOut>(`${this.base}/tasks`, body);
  }

  batchCreateTasks(body: BatchCreate): Observable<TaskOut[]> {
    return this.http.post<TaskOut[]>(`${this.base}/tasks/batch`, body);
  }

  patchTask(id: string, patch: TaskPatch): Observable<TaskOut> {
    return this.http.patch<TaskOut>(`${this.base}/tasks/${id}`, patch);
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks/${id}`);
  }

  // ------------------------------------------------------------------ state

  transitionTask(id: string, state: TaskState): Observable<TaskOut> {
    return this.http.post<TaskOut>(`${this.base}/tasks/${id}/transition`, {
      state,
    });
  }

  nextTask(assignee: string, project: string): Observable<TaskOut> {
    return this.http.post<TaskOut>(`${this.base}/tasks/next`, {
      assignee,
      project,
    });
  }

  // ---------------------------------------------------------------- history

  getTaskHistory(id: string): Observable<HistoryResponse> {
    return this.http.get<HistoryResponse>(`${this.base}/tasks/${id}/history`);
  }

  // --------------------------------------------------------------- activity

  getTaskActivity(id: string): Observable<ActivityEntryOut[]> {
    return this.http.get<ActivityEntryOut[]>(
      `${this.base}/tasks/${id}/activity`
    );
  }

  postComment(
    id: string,
    body: ActivityCommentIn
  ): Observable<ActivityEntryOut> {
    return this.http.post<ActivityEntryOut>(
      `${this.base}/tasks/${id}/activity`,
      body
    );
  }

  // ---------------------------------------------------------- dependencies

  getTaskDependencies(id: string): Observable<TaskDependencyOut[]> {
    return this.http.get<TaskDependencyOut[]>(
      `${this.base}/tasks/${id}/dependencies`
    );
  }

  addDependency(
    id: string,
    dependsOnId: string
  ): Observable<TaskDependencyOut> {
    return this.http.post<TaskDependencyOut>(
      `${this.base}/tasks/${id}/dependencies`,
      { dependsOnId }
    );
  }

  removeDependency(id: string, dependsOnId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/tasks/${id}/dependencies/${dependsOnId}`
    );
  }

  // ---------------------------------------------------------------- subtasks

  getSubtasks(id: string): Observable<TaskOut[]> {
    return this.http.get<TaskOut[]>(`${this.base}/tasks/${id}/subtasks`);
  }

  // ---------------------------------------------------------------- projects

  listProjects(): Observable<ProjectSummary[]> {
    return this.http.get<ProjectSummary[]>(`${this.base}/projects`);
  }
}
