export * from './agent';
export * from './tool-router';
export * from './orchestrator';

import { getOrchestrator } from './orchestrator';
import { getToolRouter } from './tool-router';

/**
 * Initialize the agent system
 */
export async function initializeAgents(): Promise<void> {
  console.log('Initializing Agent System...');

  // Initialize the tool router (for efficient tool selection)
  getToolRouter();

  // Initialize the orchestrator (creates sub-agents)
  getOrchestrator();

  console.log('Agent System initialized');
}
