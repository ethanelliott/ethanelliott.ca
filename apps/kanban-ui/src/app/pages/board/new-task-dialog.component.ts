import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { KanbanApiService } from '../../services/kanban-api.service';
import { ProjectService } from '../../services/project.service';
import { TaskOut, TaskState, ALL_STATES } from '../../models/task.model';

interface StateOption {
  label: string;
  value: TaskState;
}

@Component({
  selector: 'app-new-task-dialog',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    InputNumberModule,
    AutoCompleteModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      header="New Task"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      styleClass="new-task-dialog"
      [style]="{ width: '500px' }"
    >
      <form (ngSubmit)="submit()" #f="ngForm" class="task-form">
        <!-- Title -->
        <div class="field">
          <label for="title">Title <span class="req">*</span></label>
          <input
            id="title"
            pInputText
            [(ngModel)]="form.title"
            name="title"
            required
            placeholder="Short task description"
            autocomplete="off"
          />
        </div>

        <!-- Description -->
        <div class="field">
          <label for="desc">Description <span class="req">*</span></label>
          <textarea
            id="desc"
            pTextarea
            [(ngModel)]="form.description"
            name="description"
            required
            rows="4"
            placeholder="Detailed description of what needs to be done…"
            style="width:100%;resize:vertical"
          ></textarea>
        </div>

        <!-- Project -->
        <div class="field">
          <label for="project">Project <span class="req">*</span></label>
          <p-autocomplete
            inputId="project"
            [(ngModel)]="form.project"
            name="project"
            [suggestions]="projectSuggestions()"
            (completeMethod)="searchProject($event)"
            [forceSelection]="false"
            placeholder="Project name…"
            appendTo="body"
            required
          />
        </div>

        <!-- Directory -->
        <div class="field">
          <label for="directory"
            >Directory <span class="opt">(optional)</span></label
          >
          <input
            id="directory"
            pInputText
            [(ngModel)]="form.directory"
            name="directory"
            placeholder="Relative path, e.g. apps/my-app"
            autocomplete="off"
          />
        </div>

        <!-- State + Priority row -->
        <div class="field-row">
          <div class="field">
            <label for="state">Initial State</label>
            <p-select
              inputId="state"
              [(ngModel)]="form.state"
              name="state"
              [options]="stateOptions"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
            />
          </div>
          <div class="field">
            <label for="priority">Priority</label>
            <p-inputNumber
              inputId="priority"
              [(ngModel)]="form.priority"
              name="priority"
              [min]="1"
              [max]="9999"
              [step]="5"
            />
          </div>
        </div>

        <!-- Optional parent task -->
        <div class="field">
          <label>Parent Task <span class="opt">(optional)</span></label>
          <p-autocomplete
            [(ngModel)]="selectedParent"
            name="parentTask"
            [suggestions]="parentResults()"
            (completeMethod)="searchParent($event)"
            field="title"
            [forceSelection]="true"
            placeholder="Search task by title…"
            [delay]="300"
            appendTo="body"
          />
        </div>

        @if (errorMsg()) {
        <p class="error-msg">{{ errorMsg() }}</p>
        }
      </form>

      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          (onClick)="cancel()"
        />
        <p-button
          label="Create Task"
          icon="pi pi-plus"
          [loading]="saving()"
          (onClick)="submit()"
          [disabled]="
            !form.title.trim() ||
            !form.description.trim() ||
            !form.project.trim()
          "
        />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    :host ::ng-deep .new-task-dialog .p-dialog-content {
      padding-top: 8px;
    }

    .task-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 5px;

      label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--p-text-muted-color);
      }

      input, textarea {
        width: 100%;
        font-size: 0.875rem;
      }
    }

    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    :host ::ng-deep .field-row p-select,
    :host ::ng-deep .field-row p-inputnumber {
      width: 100%;
    }

    .req {
      color: var(--p-red-500, #ef4444);
    }

    .opt {
      color: var(--p-text-muted-color);
      font-weight: 400;
      font-size: 0.7rem;
    }

    .error-msg {
      font-size: 0.8rem;
      color: var(--p-red-400, #f87171);
      margin: 0;
    }
  `,
})
export class NewTaskDialogComponent implements OnInit {
  private readonly api = inject(KanbanApiService);
  private readonly projectService = inject(ProjectService);

  /** Two-way binding: parent controls visibility */
  readonly visible = model<boolean>(false);
  /** Emitted after a task is successfully created */
  readonly taskCreated = output<TaskOut>();

  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  /** For parent task autocomplete */
  selectedParent: TaskOut | null = null;
  readonly parentResults = signal<TaskOut[]>([]);

  /** For project autocomplete */
  private readonly allProjects = signal<string[]>([]);
  readonly projectSuggestions = signal<string[]>([]);

  form = {
    title: '',
    description: '',
    state: TaskState.BACKLOG as TaskState,
    priority: 100,
    project: this.projectService.selectedProject() ?? '',
    directory: '',
  };

  ngOnInit(): void {
    this.api.listProjects().subscribe({
      next: (projects) =>
        this.allProjects.set(projects.map((p) => p.project).sort()),
      error: () => {},
    });
  }

  searchProject(event: { query: string }): void {
    const q = event.query.trim().toLowerCase();
    const matches = q
      ? this.allProjects().filter((p) => p.toLowerCase().includes(q))
      : this.allProjects();
    this.projectSuggestions.set(matches.slice(0, 10));
  }

  readonly stateOptions: StateOption[] = ALL_STATES.map((s) => ({
    label: s.replace('_', ' '),
    value: s,
  }));

  searchParent(event: { query: string }): void {
    const project = this.form.project.trim();
    if (!project || !event.query.trim()) {
      this.parentResults.set([]);
      return;
    }
    this.api.listTasks({ project, search: event.query.trim() }).subscribe({
      next: (tasks) => this.parentResults.set(tasks.slice(0, 10)),
      error: () => this.parentResults.set([]),
    });
  }

  submit(): void {
    const project = this.form.project.trim();
    if (!this.form.title.trim() || !this.form.description.trim() || !project)
      return;

    this.saving.set(true);
    this.errorMsg.set(null);

    this.api
      .createTask({
        title: this.form.title.trim(),
        description: this.form.description.trim(),
        state: this.form.state,
        priority: this.form.priority,
        project,
        ...(this.form.directory.trim()
          ? { directory: this.form.directory.trim() }
          : {}),
        ...(this.selectedParent ? { parentId: this.selectedParent.id } : {}),
      })
      .subscribe({
        next: (task) => {
          this.saving.set(false);
          this.taskCreated.emit(task);
          this.resetForm();
          this.visible.set(false);
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMsg.set(
            err?.error?.message ?? 'Failed to create task. Please try again.'
          );
        },
      });
  }

  cancel(): void {
    this.resetForm();
    this.visible.set(false);
  }

  private resetForm(): void {
    this.form = {
      title: '',
      description: '',
      state: TaskState.BACKLOG,
      priority: 100,
      project: this.projectService.selectedProject() ?? '',
      directory: '',
    };
    this.selectedParent = null;
    this.parentResults.set([]);
    this.projectSuggestions.set([]);
    this.errorMsg.set(null);
  }
}
