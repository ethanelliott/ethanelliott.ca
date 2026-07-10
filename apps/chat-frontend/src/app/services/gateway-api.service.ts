import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  GatewayConfig,
  GatewayOrchestratorConfig,
  GatewayAgentConfig,
  GatewayModelInfo,
  GatewayToolInfo,
  GatewayHealthInfo,
  GatewayServiceInfo,
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class GatewayApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /** Get the full runtime configuration */
  getConfig(): Observable<GatewayConfig> {
    return this.http.get<GatewayConfig>(`${this.baseUrl}/config`);
  }

  /** Update orchestrator settings */
  updateOrchestrator(
    updates: Partial<
      Pick<
        GatewayOrchestratorConfig,
        'model' | 'systemPrompt' | 'maxDelegations' | 'routerModel'
      >
    >
  ): Observable<{ success: boolean; orchestrator: GatewayOrchestratorConfig }> {
    return this.http.put<{
      success: boolean;
      orchestrator: GatewayOrchestratorConfig;
    }>(`${this.baseUrl}/config/orchestrator`, updates);
  }

  /** Get a sub-agent's full config */
  getAgentConfig(name: string): Observable<GatewayAgentConfig> {
    return this.http.get<GatewayAgentConfig>(
      `${this.baseUrl}/config/agent/${name}`
    );
  }

  /** Update a sub-agent's runtime configuration */
  updateAgent(
    name: string,
    updates: Partial<
      Pick<
        GatewayAgentConfig,
        'model' | 'systemPrompt' | 'tools' | 'temperature' | 'maxIterations'
      >
    >
  ): Observable<{ success: boolean; agent: GatewayAgentConfig }> {
    return this.http.put<{ success: boolean; agent: GatewayAgentConfig }>(
      `${this.baseUrl}/config/agent/${name}`,
      updates
    );
  }

  /** Get available Ollama models */
  getModels(): Observable<{ count: number; models: GatewayModelInfo[] }> {
    return this.http.get<{ count: number; models: GatewayModelInfo[] }>(
      `${this.baseUrl}/config/models`
    );
  }

  /** Get all tools with status */
  getTools(): Observable<{
    count: number;
    categories: string[];
    tools: GatewayToolInfo[];
  }> {
    return this.http.get<{
      count: number;
      categories: string[];
      tools: GatewayToolInfo[];
    }>(`${this.baseUrl}/config/tools`);
  }

  /** Get health/system overview */
  getHealth(): Observable<GatewayHealthInfo> {
    return this.http.get<GatewayHealthInfo>(`${this.baseUrl}/config/health`);
  }

  /** Reset orchestrator state */
  resetOrchestrator(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/config/reset`,
      {}
    );
  }

  /** List external tool servers (MCP + simple HTTP) */
  getServices(): Observable<{
    count: number;
    services: GatewayServiceInfo[];
  }> {
    return this.http.get<{ count: number; services: GatewayServiceInfo[] }>(
      `${this.baseUrl}/services`
    );
  }

  /** Register an external tool server. Omit protocol to auto-detect. */
  registerService(registration: {
    name: string;
    url: string;
    description?: string;
    protocol?: 'mcp' | 'http';
    headers?: Record<string, string>;
  }): Observable<{ success: boolean; service: GatewayServiceInfo }> {
    return this.http.post<{ success: boolean; service: GatewayServiceInfo }>(
      `${this.baseUrl}/services`,
      registration
    );
  }

  /** Remove an external tool server and its tools */
  unregisterService(
    name: string
  ): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.baseUrl}/services/${encodeURIComponent(name)}`
    );
  }

  /** Re-sync tools from an external server */
  syncService(name: string): Observable<{
    success: boolean;
    message: string;
    tools: string[];
  }> {
    return this.http.post<{
      success: boolean;
      message: string;
      tools: string[];
    }>(`${this.baseUrl}/services/${encodeURIComponent(name)}/sync`, {});
  }
}
