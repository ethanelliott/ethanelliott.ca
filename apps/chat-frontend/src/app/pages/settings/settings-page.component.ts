import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { SettingsService } from '../../services/settings.service';
import { ConversationService } from '../../services/conversation.service';
import { ChatApiService } from '../../services/chat-api.service';
import { PromptTemplate } from '../../models/types';

interface ModelOption {
  name: string;
  label: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    SliderModule,
    ToggleSwitchModule,
    TooltipModule,
    DialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-page">
      <div class="settings-header">
        <h1>Settings</h1>
      </div>

      <!-- Appearance -->
      <section class="settings-section">
        <h2>Appearance</h2>
        <div class="setting-row">
          <div class="setting-info">
            <label>Dark Mode</label>
            <span class="setting-desc"
              >Toggle between dark and light theme</span
            >
          </div>
          <p-toggleswitch
            [(ngModel)]="darkModeValue"
            (onChange)="onDarkModeChange($event.checked)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>Font Size</label>
            <span class="setting-desc">Adjust message text size</span>
          </div>
          <p-select
            [options]="fontSizeOptions"
            [(ngModel)]="fontSizeValue"
            optionLabel="label"
            optionValue="value"
            (onChange)="settings.fontSize.set($event.value)"
            [style]="{ minWidth: '120px' }"
            size="small"
          />
        </div>
      </section>

      <!-- Model & Generation -->
      <section class="settings-section">
        <h2>Model & Generation</h2>
        <div class="setting-row">
          <div class="setting-info">
            <label>Default Model</label>
            <span class="setting-desc">Model used for new conversations</span>
          </div>
          <p-select
            [options]="models()"
            [(ngModel)]="defaultModelValue"
            optionLabel="label"
            optionValue="name"
            placeholder="Auto (server default)"
            [showClear]="true"
            (onChange)="settings.defaultModel.set($event.value ?? '')"
            [style]="{ minWidth: '200px' }"
            size="small"
          />
        </div>
        <div class="setting-row vertical">
          <div class="setting-info">
            <label>Temperature: {{ temperatureValue }}</label>
            <span class="setting-desc"
              >Controls randomness. Lower = more focused, higher = more
              creative</span
            >
          </div>
          <p-slider
            [(ngModel)]="temperatureValue"
            [min]="0"
            [max]="2"
            [step]="0.1"
            (onChange)="onTemperatureChange($event.value)"
            [style]="{ width: '100%' }"
          />
        </div>
        <div class="setting-row vertical">
          <div class="setting-info">
            <label>System Prompt</label>
            <span class="setting-desc"
              >Default instructions applied to all new conversations</span
            >
          </div>
          <textarea
            pTextarea
            [(ngModel)]="systemPromptValue"
            [autoResize]="true"
            [rows]="3"
            placeholder="You are a helpful assistant..."
            class="system-prompt-input"
            (blur)="settings.globalSystemPrompt.set(systemPromptValue)"
          ></textarea>
        </div>
      </section>

      <!-- Prompt Templates -->
      <section class="settings-section">
        <div class="section-header">
          <h2>Prompt Templates</h2>
          <p-button
            icon="pi pi-plus"
            label="New Template"
            severity="primary"
            size="small"
            [outlined]="true"
            (click)="openTemplateDialog()"
          />
        </div>
        @if (templates().length === 0) {
        <div class="empty-templates">
          <i class="pi pi-bookmark"></i>
          <span
            >No saved templates. Create one to quickly start
            conversations.</span
          >
        </div>
        } @else { @for (tmpl of templates(); track tmpl.id) {
        <div class="template-card">
          <div class="template-info">
            <div class="template-name">{{ tmpl.name }}</div>
            @if (tmpl.description) {
            <div class="template-desc">{{ tmpl.description }}</div>
            }
          </div>
          <div class="template-actions">
            <p-button
              icon="pi pi-play"
              [rounded]="true"
              [text]="true"
              severity="primary"
              size="small"
              pTooltip="Use template"
              (click)="useTemplate(tmpl)"
            />
            <p-button
              icon="pi pi-pencil"
              [rounded]="true"
              [text]="true"
              severity="secondary"
              size="small"
              pTooltip="Edit"
              (click)="editTemplate(tmpl)"
            />
            <p-button
              icon="pi pi-trash"
              [rounded]="true"
              [text]="true"
              severity="danger"
              size="small"
              pTooltip="Delete"
              (click)="deleteTemplate(tmpl.id)"
            />
          </div>
        </div>
        } }
      </section>

      <!-- Template Dialog -->
      <p-dialog
        [(visible)]="templateDialogVisible"
        [modal]="true"
        [closable]="true"
        [style]="{ width: '480px' }"
        [header]="editingTemplate ? 'Edit Template' : 'New Template'"
      >
        <div class="template-form">
          <div class="form-field">
            <label>Name</label>
            <input
              pInputText
              [(ngModel)]="templateForm.name"
              placeholder="Template name"
            />
          </div>
          <div class="form-field">
            <label>Description</label>
            <input
              pInputText
              [(ngModel)]="templateForm.description"
              placeholder="Brief description (optional)"
            />
          </div>
          <div class="form-field">
            <label>System Prompt</label>
            <textarea
              pTextarea
              [(ngModel)]="templateForm.systemPrompt"
              [autoResize]="true"
              [rows]="3"
              placeholder="Custom system prompt for this template"
            ></textarea>
          </div>
          <div class="form-field">
            <label>Starter Message</label>
            <textarea
              pTextarea
              [(ngModel)]="templateForm.starterMessage"
              [autoResize]="true"
              [rows]="2"
              placeholder="Auto-send this message when template is used"
            ></textarea>
          </div>
        </div>
        <ng-template #footer>
          <p-button
            label="Cancel"
            severity="secondary"
            [text]="true"
            (click)="templateDialogVisible = false"
          />
          <p-button
            [label]="editingTemplate ? 'Save' : 'Create'"
            severity="primary"
            [disabled]="!templateForm.name.trim()"
            (click)="saveTemplate()"
          />
        </ng-template>
      </p-dialog>

      <!-- Data Management -->
      <section class="settings-section">
        <h2>Data Management</h2>
        <div class="setting-row">
          <div class="setting-info">
            <label>Export Conversations</label>
            <span class="setting-desc"
              >Download all conversations as a JSON file</span
            >
          </div>
          <p-button
            icon="pi pi-download"
            label="Export"
            severity="secondary"
            [outlined]="true"
            size="small"
            (click)="exportConversations()"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>Import Conversations</label>
            <span class="setting-desc"
              >Load conversations from a JSON file</span
            >
          </div>
          <p-button
            icon="pi pi-upload"
            label="Import"
            severity="secondary"
            [outlined]="true"
            size="small"
            (click)="importInput.click()"
          />
          <input
            #importInput
            type="file"
            accept=".json"
            hidden
            (change)="importConversations($event)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>Clear All Conversations</label>
            <span class="setting-desc danger"
              >Permanently delete all conversation history</span
            >
          </div>
          <p-button
            icon="pi pi-trash"
            label="Clear All"
            severity="danger"
            [outlined]="true"
            size="small"
            (click)="confirmClearAll()"
          />
        </div>
      </section>

      <!-- Clear All Confirmation -->
      <p-dialog
        [(visible)]="clearConfirmVisible"
        [modal]="true"
        [closable]="true"
        header="Clear All Conversations?"
        [style]="{ width: '400px' }"
      >
        <p class="confirm-text">
          This will permanently delete
          <strong>{{ conversationService.conversations().length }}</strong>
          conversation(s). This action cannot be undone.
        </p>
        <ng-template #footer>
          <p-button
            label="Cancel"
            severity="secondary"
            [text]="true"
            (click)="clearConfirmVisible = false"
          />
          <p-button
            label="Delete All"
            severity="danger"
            icon="pi pi-trash"
            (click)="clearAllConversations()"
          />
        </ng-template>
      </p-dialog>

      <!-- About -->
      <section class="settings-section about">
        <h2>About</h2>
        <div class="about-info">
          <span>AI Chat — Personal AI assistant interface</span>
          <span class="about-detail"
            >Angular 21 + PrimeNG 21 · Ollama backend</span
          >
          <span class="about-detail">
            {{ conversationService.conversations().length }} conversation(s)
            stored locally
          </span>
        </div>
      </section>
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 24px 24px 48px;
      overflow-y: auto;
      height: 100%;
    }

    .settings-header {
      margin-bottom: 24px;

      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        color: var(--p-text-color);
      }
    }

    .settings-section {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--p-surface-800);

      &:last-child {
        border-bottom: none;
      }

      h2 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 14px;
        color: var(--p-text-color);
      }
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;

      h2 { margin-bottom: 0; }
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      gap: 16px;

      &.vertical {
        flex-direction: column;
        align-items: stretch;
      }

      &+ .setting-row {
        border-top: 1px solid var(--p-surface-800);
      }
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 2px;

      label {
        font-size: 0.88rem;
        font-weight: 500;
        color: var(--p-text-color);
      }

      .setting-desc {
        font-size: 0.78rem;
        color: var(--p-text-muted-color);

        &.danger {
          color: var(--p-red-400);
        }
      }
    }

    .system-prompt-input {
      width: 100%;
      font-size: 0.85rem;
    }

    /* Templates */
    .empty-templates {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px;
      color: var(--p-text-muted-color);
      font-size: 0.82rem;
      background: var(--p-surface-900);
      border-radius: 8px;

      i { font-size: 1.1rem; opacity: 0.5; }
    }

    .template-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      margin-bottom: 8px;

      &:last-child { margin-bottom: 0; }
    }

    .template-info {
      flex: 1;
      min-width: 0;
    }

    .template-name {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--p-text-color);
    }

    .template-desc {
      font-size: 0.75rem;
      color: var(--p-text-muted-color);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .template-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }

    .template-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.82rem;
        font-weight: 500;
        color: var(--p-text-muted-color);
      }
    }

    /* Data management */
    .confirm-text {
      font-size: 0.9rem;
      line-height: 1.5;
      color: var(--p-text-color);
      margin: 0;
    }

    /* About */
    .about-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
    }

    .about-detail {
      font-size: 0.78rem;
    }

    @media (max-width: 768px) {
      .settings-page {
        padding: 16px 16px 48px;
      }

      .setting-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
    }
  `,
})
export class SettingsPageComponent implements OnInit {
  readonly settings = inject(SettingsService);
  readonly conversationService = inject(ConversationService);
  private readonly chatApi = inject(ChatApiService);
  private readonly router = inject(Router);

  readonly models = signal<ModelOption[]>([]);
  readonly templates = computed(() => this.settings.promptTemplates());

  darkModeValue = this.settings.darkMode();
  fontSizeValue = this.settings.fontSize();
  defaultModelValue = this.settings.defaultModel();
  temperatureValue = this.settings.temperature();
  systemPromptValue = this.settings.globalSystemPrompt();

  templateDialogVisible = false;
  editingTemplate: PromptTemplate | null = null;
  templateForm = {
    name: '',
    description: '',
    systemPrompt: '',
    starterMessage: '',
  };

  clearConfirmVisible = false;

  readonly fontSizeOptions = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ];

  ngOnInit(): void {
    this.chatApi.getModels().subscribe({
      next: (res) => {
        this.models.set(
          res.models.map((m) => ({
            name: m.name,
            label: m.name + (m.sizeGb ? ` (${m.sizeGb}GB)` : ''),
          }))
        );
      },
    });
  }

  onDarkModeChange(checked: boolean): void {
    this.settings.darkMode.set(checked);
    if (checked) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  onTemperatureChange(value: number | undefined): void {
    if (value != null) {
      this.settings.temperature.set(value);
    }
  }

  // Template CRUD
  openTemplateDialog(template?: PromptTemplate): void {
    this.editingTemplate = template ?? null;
    this.templateForm = {
      name: template?.name ?? '',
      description: template?.description ?? '',
      systemPrompt: template?.systemPrompt ?? '',
      starterMessage: template?.starterMessage ?? '',
    };
    this.templateDialogVisible = true;
  }

  editTemplate(template: PromptTemplate): void {
    this.openTemplateDialog(template);
  }

  saveTemplate(): void {
    const name = this.templateForm.name.trim();
    if (!name) return;

    if (this.editingTemplate) {
      // Update existing
      this.settings.promptTemplates.update((templates) =>
        templates.map((t) =>
          t.id === this.editingTemplate!.id
            ? {
                ...t,
                name,
                description: this.templateForm.description.trim() || undefined,
                systemPrompt:
                  this.templateForm.systemPrompt.trim() || undefined,
                starterMessage:
                  this.templateForm.starterMessage.trim() || undefined,
              }
            : t
        )
      );
    } else {
      // Create new
      const newTemplate: PromptTemplate = {
        id: crypto.randomUUID(),
        name,
        description: this.templateForm.description.trim() || undefined,
        systemPrompt: this.templateForm.systemPrompt.trim() || undefined,
        starterMessage: this.templateForm.starterMessage.trim() || undefined,
      };
      this.settings.promptTemplates.update((templates) => [
        ...templates,
        newTemplate,
      ]);
    }
    this.templateDialogVisible = false;
  }

  deleteTemplate(id: string): void {
    this.settings.promptTemplates.update((templates) =>
      templates.filter((t) => t.id !== id)
    );
  }

  useTemplate(template: PromptTemplate): void {
    // Create a new conversation with the template's system prompt
    const convo = this.conversationService.createConversation(
      template.name,
      template.systemPrompt
        ? { model: this.settings.defaultModel() || undefined }
        : undefined
    );
    // Store the system prompt override if set
    if (template.systemPrompt) {
      this.settings.globalSystemPrompt.set(template.systemPrompt);
    }
    this.router.navigate(['/chat', convo.id]);
  }

  // Data management
  exportConversations(): void {
    const json = this.conversationService.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-conversations-${
      new Date().toISOString().split('T')[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importConversations(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.conversationService.importAll(reader.result as string);
      } catch {
        console.error('Failed to import conversations');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  confirmClearAll(): void {
    this.clearConfirmVisible = true;
  }

  clearAllConversations(): void {
    this.conversationService.clearAll();
    this.clearConfirmVisible = false;
  }
}
