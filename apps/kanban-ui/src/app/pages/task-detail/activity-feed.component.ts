import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { KanbanApiService } from '../../services/kanban-api.service';
import { MarkdownService } from '../../services/markdown.service';
import {
  ActivityEntryOut,
  ActivityEntryType,
} from '../../models/activity.model';

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TextareaModule,
    InputTextModule,
    ButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Activity entries (reverse chronological) -->
    <div class="feed-list">
      @if (entries().length === 0 && !loading()) {
      <div class="feed-empty">No activity yet.</div>
      } @for (entry of sortedEntries(); track entry.id) {
      <div class="feed-entry" [class]="'type-' + entry.type.toLowerCase()">
        <div class="entry-icon">{{ entryIcon(entry.type) }}</div>
        <div class="entry-body">
          <div class="entry-header">
            @if (entry.author) {
            <span class="entry-author">{{ entry.author }}</span>
            }
            <span class="entry-ts">{{ fmt(entry.createdAt) }}</span>
          </div>

          @switch (entry.type) { @case (ActivityEntryType.COMMENT) {
          <div class="comment-bubble">
            <div
              class="comment-text md-content"
              [innerHTML]="md.render(entry.content)"
            ></div>
          </div>
          } @case (ActivityEntryType.STATE_CHANGE) {
          <div class="event-pill state-change">
            {{ entry.content }}
          </div>
          } @case (ActivityEntryType.ASSIGNMENT) {
          <div class="event-pill assignment">
            {{ entry.content }}
          </div>
          } @case (ActivityEntryType.DEPENDENCY) {
          <div class="event-pill dependency">
            {{ entry.content }}
          </div>
          } @case (ActivityEntryType.SUBTASK) {
          <div class="event-pill subtask">
            {{ entry.content }}
          </div>
          } }
        </div>
      </div>
      }
    </div>

    <!-- Comment composer -->
    @if (showComposer()) {
    <div class="composer">
      <div class="composer-header">Add a comment</div>
      <textarea
        pTextarea
        [(ngModel)]="commentText"
        placeholder="Write a comment…"
        rows="3"
        class="composer-input"
        [disabled]="posting()"
      ></textarea>
      <div class="composer-footer">
        <div class="author-row">
          <label for="commentAuthor" class="author-label">Post as:</label>
          <input
            id="commentAuthor"
            pInputText
            [(ngModel)]="commentAuthor"
            placeholder="your-name"
            class="author-input"
          />
        </div>
        <p-button
          label="Submit"
          icon="pi pi-send"
          size="small"
          [loading]="posting()"
          [disabled]="!commentText.trim() || !commentAuthor.trim()"
          (onClick)="submitComment()"
        />
      </div>
      @if (postError()) {
      <p class="post-error">{{ postError() }}</p>
      }
    </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .feed-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .feed-empty {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
      padding: 12px 0;
      text-align: center;
    }

    .feed-entry {
      display: flex;
      gap: 10px;
      padding: 8px 4px;
      border-radius: 6px;
      align-items: flex-start;
    }

    .entry-icon {
      font-size: 0.9rem;
      flex-shrink: 0;
      width: 22px;
      text-align: center;
      padding-top: 2px;
    }

    .entry-body {
      flex: 1;
      min-width: 0;
    }

    .entry-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .entry-author {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--p-primary-color);
    }

    .entry-ts {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
    }

    /* Comment bubble */
    .comment-bubble {
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-600);
      border-radius: 0 8px 8px 8px;
      padding: 8px 12px;
    }

    .comment-text {
      margin: 0;
      font-size: 0.82rem;
      color: var(--p-text-color);
      word-break: break-word;
    }

    .comment-text.md-content :is(p, ul, ol, blockquote) {
      margin: 0 0 6px;
    }
    .comment-text.md-content p:last-child {
      margin-bottom: 0;
    }
    .comment-text.md-content pre {
      margin: 6px 0;
      border-radius: 4px;
      overflow-x: auto;
    }
    .comment-text.md-content code:not(pre code) {
      background: var(--p-surface-700);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.78rem;
    }
    .comment-text.md-content a {
      color: var(--p-primary-color);
    }

    /* System event pills */
    .event-pill {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 500;
    }

    .event-pill.state-change   { background: #a78bfa22; color: #a78bfa; }
    .event-pill.assignment     { background: #60a5fa22; color: #60a5fa; }
    .event-pill.dependency     { background: #fbbf2422; color: #fbbf24; }
    .event-pill.subtask        { background: #34d39922; color: #34d399; }

    /* Composer — pinned at bottom, never scrolls away */
    .composer {
      flex-shrink: 0;
      border-top: 1px solid var(--p-surface-700);
      padding-top: 12px;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .composer-header {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--p-text-muted-color);
    }

    .composer-input {
      width: 100%;
      font-size: 0.875rem;
      resize: vertical;
    }

    .composer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .author-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .author-label {
      font-size: 0.75rem;
      color: var(--p-text-muted-color);
    }

    .author-input {
      width: 140px;
      font-size: 0.8rem;
    }

    .post-error {
      margin: 0;
      font-size: 0.75rem;
      color: var(--p-red-400, #f87171);
    }
  `,
})
export class ActivityFeedComponent {
  private readonly api = inject(KanbanApiService);
  readonly md = inject(MarkdownService);

  readonly taskId = input.required<string>();
  readonly entries = input<ActivityEntryOut[]>([]);
  readonly loading = input(false);
  readonly entryFilter = input<'all' | 'comments'>('all');
  readonly showComposer = input(true);

  readonly commented = output<ActivityEntryOut>();

  readonly ActivityEntryType = ActivityEntryType;

  commentText = '';
  commentAuthor = '';
  readonly posting = signal(false);
  readonly postError = signal<string | null>(null);

  readonly sortedEntries = computed(() => {
    const sorted = [...this.entries()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (this.entryFilter() === 'comments') {
      return sorted.filter((e) => e.type === ActivityEntryType.COMMENT);
    }
    return sorted;
  });

  entryIcon(type: ActivityEntryType): string {
    const map: Record<ActivityEntryType, string> = {
      [ActivityEntryType.COMMENT]: '💬',
      [ActivityEntryType.STATE_CHANGE]: '🔄',
      [ActivityEntryType.ASSIGNMENT]: '👤',
      [ActivityEntryType.DEPENDENCY]: '🔗',
      [ActivityEntryType.SUBTASK]: '📋',
    };
    return map[type] ?? '•';
  }

  fmt(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  submitComment(): void {
    if (!this.commentText.trim() || !this.commentAuthor.trim()) return;
    this.posting.set(true);
    this.postError.set(null);

    this.api
      .postComment(this.taskId(), {
        author: this.commentAuthor.trim(),
        content: this.commentText.trim(),
      })
      .subscribe({
        next: (entry) => {
          this.posting.set(false);
          this.commentText = '';
          this.commented.emit(entry);
        },
        error: (err) => {
          this.posting.set(false);
          this.postError.set(err?.error?.message ?? 'Failed to post comment.');
        },
      });
  }
}
