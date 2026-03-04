import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDropList,
  CdkDropListGroup,
  CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { BadgeModule } from 'primeng/badge';
import { TaskOut, TaskState } from '../../models/task.model';
import { TaskCardComponent } from './task-card.component';

const STATE_LABELS: Record<TaskState, string> = {
  [TaskState.BACKLOG]: 'Backlog',
  [TaskState.TODO]: 'Todo',
  [TaskState.IN_PROGRESS]: 'In Progress',
  [TaskState.BLOCKED]: 'Blocked',
  [TaskState.IN_REVIEW]: 'In Review',
  [TaskState.CHANGES_REQUESTED]: 'Changes Requested',
  [TaskState.DONE]: 'Done',
};

const STATE_ACCENT: Record<TaskState, string> = {
  [TaskState.BACKLOG]: '#64748b',
  [TaskState.TODO]: '#60a5fa',
  [TaskState.IN_PROGRESS]: '#a78bfa',
  [TaskState.BLOCKED]: '#f87171',
  [TaskState.IN_REVIEW]: '#fbbf24',
  [TaskState.CHANGES_REQUESTED]: '#f97316',
  [TaskState.DONE]: '#34d399',
};

export interface TaskDropEvent {
  task: TaskOut;
  targetState: TaskState;
}

@Component({
  selector: 'app-board-column',
  standalone: true,
  imports: [CommonModule, CdkDropList, BadgeModule, TaskCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="column" [style.--accent]="accent()">
      <!-- Column header -->
      <div class="col-header">
        <span class="col-label">{{ label() }}</span>
        <span class="col-count">{{ tasks().length }}</span>
      </div>

      <!-- Drop list -->
      <div
        class="col-body"
        cdkDropList
        [id]="columnId()"
        [cdkDropListData]="tasks()"
        [cdkDropListConnectedTo]="connectedTo()"
        (cdkDropListDropped)="onDrop($event)"
        (cdkDropListEntered)="isReceiving.set(true)"
        (cdkDropListExited)="isReceiving.set(false)"
      >
        @for (task of tasks(); track task.id) {
        <app-task-card
          [task]="task"
          (dragStarted)="columnDragStarted.emit($event)"
          (dragEnded)="columnDragEnded.emit()"
          (quickTransition)="
            taskDropped.emit({ task: $event.task, targetState: $event.state })
          "
        />
        } @if (tasks().length === 0 && !isReceiving()) {
        <div class="col-empty">
          <i class="pi pi-inbox col-empty-icon"></i>
          <span>No tasks</span>
        </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      flex: 1 1 180px;
      min-width: 180px;
      min-height: 0;
      display: flex;
      scroll-snap-align: start;
    }

    .column {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: var(--p-surface-900);
      border-radius: 10px;
      border: 1px solid var(--p-surface-700);
      overflow: hidden;
    }

    .col-header {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 12px;
      border-bottom: 2px solid var(--accent, var(--p-surface-600));
      flex-shrink: 0;
    }

    .col-label {
      flex: 1;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--p-text-color);
      white-space: nowrap;
    }

    .col-count {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 10px;
      background: var(--p-surface-700);
      color: var(--p-text-muted-color);
    }

    .col-body {
      flex: 1;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow-y: auto;
      min-height: 0;
    }

    .col-empty {
      font-size: 0.75rem;
      color: var(--p-text-muted-color);
      text-align: center;
      padding: 20px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    :host ::ng-deep .cdk-drag-placeholder {
      border: 2px dashed var(--accent, var(--p-primary-color));
      border-radius: 8px;
      background: color-mix(
        in srgb,
        var(--accent, var(--p-primary-color)) 10%,
        transparent
      );
      min-height: 64px;
      box-sizing: border-box;
      animation: dropzone-pulse 0.9s ease-in-out infinite alternate;
    }

    :host ::ng-deep .cdk-drag-placeholder > * {
      visibility: hidden;
    }

    @keyframes dropzone-pulse {
      from { opacity: 0.65; }
      to   { opacity: 1; }
    }

    .col-empty-icon {
      font-size: 1.3rem;
      opacity: 0.35;
    }

    /* CDK drop zone highlight */
    .col-body.cdk-drop-list-dragging {
      background: color-mix(in srgb, var(--accent, var(--p-primary-color)) 8%, transparent);
      border-radius: 0 0 8px 8px;
    }

    .col-body.cdk-drop-list-receiving {
      background: color-mix(in srgb, var(--accent, var(--p-primary-color)) 12%, transparent);
    }
  `,
})
export class BoardColumnComponent {
  readonly state = input.required<TaskState>();
  readonly tasks = input<TaskOut[]>([]);
  readonly connectedTo = input<string[]>([]);

  readonly taskDropped = output<TaskDropEvent>();
  readonly columnDragStarted = output<TaskOut>();
  readonly columnDragEnded = output<void>();

  readonly columnId = computed(() => `col-${this.state()}`);
  readonly label = computed(() => STATE_LABELS[this.state()]);
  readonly accent = computed(() => STATE_ACCENT[this.state()]);

  readonly isReceiving = signal(false);

  onDrop(event: CdkDragDrop<TaskOut[]>): void {
    this.isReceiving.set(false);
    if (event.previousContainer === event.container) return;
    const task = event.item.data as TaskOut;
    const targetState = this.state();
    this.taskDropped.emit({ task, targetState });
  }
}
