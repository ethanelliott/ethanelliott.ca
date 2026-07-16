import { StepType } from './workflow.types';

/**
 * Step Type Registry
 *
 * Mirrors the tool registry pattern: each workflow step kind is a small
 * object with a config schema (drives the editor form) and an executor.
 * Adding a new step type is one file in ./steps plus a register call.
 */
class StepRegistry {
  private steps: Map<string, StepType> = new Map();

  register(step: StepType): void {
    if (this.steps.has(step.kind)) {
      console.warn(
        `[Workflows] Step kind "${step.kind}" already registered, overwriting`
      );
    }
    this.steps.set(step.kind, step);
  }

  get(kind: string): StepType | undefined {
    return this.steps.get(kind);
  }

  getAll(): StepType[] {
    return Array.from(this.steps.values());
  }

  getTriggers(): StepType[] {
    return this.getAll().filter((s) => s.isTrigger);
  }
}

const stepRegistry = new StepRegistry();

export function getStepRegistry(): StepRegistry {
  return stepRegistry;
}
