import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
  input,
  ElementRef,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { FileAttachment } from '../../models/types';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.log',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.vue',
  '.svelte',
  '.dockerfile',
  '.env',
  '.gitignore',
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1MB

export interface SendMessageEvent {
  text: string;
  attachments: FileAttachment[];
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule, TextareaModule, ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-input-container">
      @if (attachments().length) {
      <div class="attachments-preview">
        @for (att of attachments(); track att.name) {
        <div class="attachment-chip" [class.image]="isImage(att)">
          @if (att.previewUrl) {
          <img [src]="att.previewUrl" [alt]="att.name" class="preview-thumb" />
          } @else {
          <i class="pi pi-file"></i>
          }
          <span class="att-name">{{ att.name }}</span>
          <button class="remove-btn" (click)="removeAttachment(att.name)">
            <i class="pi pi-times"></i>
          </button>
        </div>
        }
      </div>
      }
      <div class="input-row">
        <p-button
          icon="pi pi-paperclip"
          [rounded]="true"
          [text]="true"
          severity="secondary"
          pTooltip="Attach file"
          (click)="fileInput.click()"
          size="small"
        />
        <input
          #fileInput
          type="file"
          [accept]="acceptTypes"
          multiple
          hidden
          (change)="onFilesSelected($event)"
        />
        <textarea
          pTextarea
          [(ngModel)]="messageText"
          [autoResize]="true"
          [rows]="1"
          placeholder="Send a message..."
          class="chat-textarea"
          (keydown)="onKeydown($event)"
          (paste)="onPaste($event)"
          #textareaEl
        ></textarea>
        @if (isStreaming()) {
        <p-button
          icon="pi pi-stop"
          [rounded]="true"
          severity="danger"
          pTooltip="Stop generating"
          (click)="stopGeneration.emit()"
        />
        } @else {
        <p-button
          icon="pi pi-send"
          [rounded]="true"
          [disabled]="!canSend()"
          pTooltip="Send message"
          (click)="send()"
        />
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
      margin-top: auto;
    }

    .chat-input-container {
      padding: 12px 16px 16px;
      background: var(--p-surface-950);
      border-top: 1px solid var(--p-surface-700);
    }

    .attachments-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-width: 800px;
      margin: 0 auto 8px;
      padding: 0 4px;
    }

    .attachment-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 0.78rem;
      color: var(--p-text-color);
      max-width: 200px;

      &.image {
        padding: 2px 8px 2px 2px;
      }
    }

    .preview-thumb {
      width: 32px;
      height: 32px;
      object-fit: cover;
      border-radius: 6px;
    }

    .att-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .remove-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      padding: 2px;
      border-radius: 50%;
      flex-shrink: 0;

      &:hover {
        color: var(--p-text-color);
        background: var(--p-surface-700);
      }

      i { font-size: 0.7rem; }
    }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      max-width: 800px;
      margin: 0 auto;
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-600);
      border-radius: 16px;
      padding: 8px 8px 8px 4px;
      transition: border-color 0.2s ease;

      &:focus-within {
        border-color: var(--p-primary-color);
      }
    }

    .chat-textarea {
      flex: 1;
      border: none !important;
      background: transparent !important;
      resize: none;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--p-text-color);
      padding: 4px 0;
      max-height: 200px;
      box-shadow: none !important;
      outline: none !important;

      &::placeholder {
        color: var(--p-text-muted-color);
      }
    }

    :host ::ng-deep {
      .p-textarea {
        border: none;
        background: transparent;
        box-shadow: none;
        padding: 4px 0;

        &:focus {
          border: none;
          box-shadow: none;
        }
      }
    }

    @media (max-width: 768px) {
      .chat-input-container {
        padding: 8px 12px 12px;
      }

      .input-row {
        border-radius: 12px;
        padding: 6px 6px 6px 4px;
      }
    }
  `,
})
export class ChatInputComponent {
  readonly isStreaming = input(false);
  readonly sendMessage = output<SendMessageEvent>();
  readonly stopGeneration = output<void>();

  messageText = '';
  readonly attachments = signal<FileAttachment[]>([]);
  private readonly textareaEl =
    viewChild<ElementRef<HTMLTextAreaElement>>('textareaEl');

  readonly acceptTypes =
    IMAGE_TYPES.join(',') + ',' + TEXT_EXTENSIONS.map((e) => e).join(',');

  canSend(): boolean {
    return !!(this.messageText.trim() || this.attachments().length);
  }

  isImage(att: FileAttachment): boolean {
    return IMAGE_TYPES.includes(att.type);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }
    if (imageItems.length === 0) return;
    event.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) this.processFile(file);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    for (const file of Array.from(input.files)) {
      this.processFile(file);
    }
    input.value = '';
  }

  removeAttachment(name: string): void {
    this.attachments.update((atts) => {
      const removed = atts.find((a) => a.name === name);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return atts.filter((a) => a.name !== name);
    });
  }

  send(): void {
    const text = this.messageText.trim();
    const atts = this.attachments();
    if (!text && !atts.length) return;

    this.sendMessage.emit({ text, attachments: [...atts] });
    this.messageText = '';
    this.attachments.set([]);

    const el = this.textareaEl()?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  focus(): void {
    this.textareaEl()?.nativeElement?.focus();
  }

  /** Called from parent for drag-and-drop files */
  addFiles(files: File[]): void {
    for (const file of files) {
      this.processFile(file);
    }
  }

  private processFile(file: File): void {
    // Check for duplicates
    if (this.attachments().some((a) => a.name === file.name)) return;

    if (IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        console.warn(`Image too large: ${file.name} (${file.size} bytes)`);
        return;
      }
      this.readAsBase64(file, true);
    } else if (this.isTextFile(file.name)) {
      if (file.size > MAX_TEXT_SIZE) {
        console.warn(`File too large: ${file.name} (${file.size} bytes)`);
        return;
      }
      this.readAsText(file);
    } else {
      console.warn(`Unsupported file type: ${file.type || file.name}`);
    }
  }

  private isTextFile(name: string): boolean {
    const lower = name.toLowerCase();
    return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  private readAsBase64(file: File, isImage: boolean): void {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Full = reader.result as string;
      // Strip data URL prefix for the API (just the raw base64)
      const base64 = base64Full.split(',')[1] || base64Full;
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      this.attachments.update((atts) => [
        ...atts,
        { name: file.name, type: file.type, base64, previewUrl },
      ]);
    };
    reader.readAsDataURL(file);
  }

  private readAsText(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // For text files, store the text content as base64 too for consistency,
      // but we'll inline it as text when building the message
      this.attachments.update((atts) => [
        ...atts,
        {
          name: file.name,
          type: file.type || 'text/plain',
          base64: btoa(unescape(encodeURIComponent(text))),
        },
      ]);
    };
    reader.readAsText(file);
  }
}
