import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  OnInit,
} from '@angular/core';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { ChatApiService } from '../../services/chat-api.service';
import { SettingsService } from '../../services/settings.service';

interface ModelOption {
  name: string;
  label: string;
  sizeGb: number;
}

@Component({
  selector: 'app-model-selector',
  standalone: true,
  imports: [SelectModule, FormsModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="model-selector">
      <p-select
        [options]="models()"
        [(ngModel)]="selectedModel"
        optionLabel="label"
        optionValue="name"
        placeholder="Select model..."
        [loading]="loading()"
        [style]="{ minWidth: '180px' }"
        (onChange)="onModelChange($event.value)"
        size="small"
      />
    </div>
  `,
  styles: `
    .model-selector {
      display: flex;
      align-items: center;
    }

    :host ::ng-deep {
      .p-select {
        background: var(--p-surface-800);
        border-color: var(--p-surface-600);
        font-size: 0.8rem;

        &:hover {
          border-color: var(--p-surface-500);
        }
      }
    }
  `,
})
export class ModelSelectorComponent implements OnInit {
  private readonly chatApi = inject(ChatApiService);
  private readonly settings = inject(SettingsService);

  readonly modelChange = output<string>();

  models = signal<ModelOption[]>([]);
  loading = signal(false);
  selectedModel = this.settings.defaultModel() || '';

  ngOnInit(): void {
    this.loadModels();
  }

  private loadModels(): void {
    this.loading.set(true);
    this.chatApi.getModels().subscribe({
      next: (response) => {
        const opts = response.models.map((m) => ({
          name: m.name,
          label: `${m.name} (${m.sizeGb.toFixed(1)}GB)`,
          sizeGb: m.sizeGb,
        }));
        this.models.set(opts);
        this.loading.set(false);

        // If no model selected but we have options, select first
        if (!this.selectedModel && opts.length > 0) {
          this.selectedModel = opts[0].name;
          this.onModelChange(opts[0].name);
        }
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  onModelChange(model: string): void {
    this.settings.defaultModel.set(model);
    this.modelChange.emit(model);
  }
}
