import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Workflow,
  WorkflowSummary,
  WorkflowGraph,
  WorkflowSettings,
  WorkflowRunSummary,
  WorkflowRunDetail,
  StepTypeInfo,
  GraphValidationError,
} from '../models/workflow.types';

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/workflows`;

  getStepTypes(): Observable<{ count: number; stepTypes: StepTypeInfo[] }> {
    return this.http.get<{ count: number; stepTypes: StepTypeInfo[] }>(
      `${this.baseUrl}/step-types`
    );
  }

  validate(
    graph: WorkflowGraph
  ): Observable<{ valid: boolean; errors: GraphValidationError[] }> {
    return this.http.post<{ valid: boolean; errors: GraphValidationError[] }>(
      `${this.baseUrl}/validate`,
      { graph }
    );
  }

  list(): Observable<{ count: number; workflows: WorkflowSummary[] }> {
    return this.http.get<{ count: number; workflows: WorkflowSummary[] }>(
      this.baseUrl
    );
  }

  get(id: string): Observable<Workflow> {
    return this.http.get<Workflow>(`${this.baseUrl}/${id}`);
  }

  create(body: {
    name: string;
    description?: string;
    graph: WorkflowGraph;
    settings?: WorkflowSettings;
  }): Observable<{ success: boolean; workflow: Workflow }> {
    return this.http.post<{ success: boolean; workflow: Workflow }>(
      this.baseUrl,
      body
    );
  }

  update(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      graph: WorkflowGraph;
      settings: WorkflowSettings;
      enabled: boolean;
      cron: string | null;
    }>
  ): Observable<{ success: boolean; workflow: Workflow }> {
    return this.http.put<{ success: boolean; workflow: Workflow }>(
      `${this.baseUrl}/${id}`,
      body
    );
  }

  delete(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`);
  }

  run(
    id: string,
    input?: unknown
  ): Observable<{ success: boolean; runId: string }> {
    return this.http.post<{ success: boolean; runId: string }>(
      `${this.baseUrl}/${id}/run`,
      { input }
    );
  }

  runs(
    id: string,
    limit = 20
  ): Observable<{ count: number; runs: WorkflowRunSummary[] }> {
    return this.http.get<{ count: number; runs: WorkflowRunSummary[] }>(
      `${this.baseUrl}/${id}/runs?limit=${limit}`
    );
  }

  runDetail(runId: string): Observable<WorkflowRunDetail> {
    return this.http.get<WorkflowRunDetail>(`${this.baseUrl}/runs/${runId}`);
  }

  cancelRun(runId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}/runs/${runId}/cancel`,
      {}
    );
  }
}
