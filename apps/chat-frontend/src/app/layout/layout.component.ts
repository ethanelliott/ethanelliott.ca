import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
  computed,
  HostListener,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { ConversationService } from '../services/conversation.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    DrawerModule,
    ButtonModule,
    TooltipModule,
    InputTextModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile Header -->
    <div class="mobile-header">
      <p-button
        icon="pi pi-bars"
        [text]="true"
        severity="secondary"
        (click)="drawerVisible.set(true)"
      />
      <span class="mobile-title">
        <i class="pi pi-sparkles"></i>
        AI Chat
      </span>
      <p-button
        icon="pi pi-plus"
        [text]="true"
        severity="secondary"
        (click)="newChat()"
        pTooltip="New Chat"
      />
    </div>

    <!-- Mobile Drawer -->
    <p-drawer
      [(visible)]="drawerVisible"
      [modal]="true"
      [showCloseIcon]="false"
      styleClass="sidebar-drawer"
    >
      <ng-template #header>
        <div class="sidebar-brand">
          <i class="pi pi-sparkles brand-icon"></i>
          <span class="brand-text">AI Chat</span>
        </div>
      </ng-template>
      <div class="sidebar-content">
        <p-button
          label="New Chat"
          icon="pi pi-plus"
          severity="primary"
          [style]="{ width: '100%' }"
          (click)="newChat(); drawerVisible.set(false)"
        />
        <div class="search-box">
          <span class="p-input-icon-left search-input-wrapper">
            <i class="pi pi-search"></i>
            <input
              pInputText
              [(ngModel)]="searchQuery"
              placeholder="Search conversations..."
              class="search-input"
            />
            @if (searchQuery()) {
            <button
              class="search-clear"
              (click)="searchQuery.set('')"
            >
              <i class="pi pi-times"></i>
            </button>
            }
          </span>
        </div>
        <div class="conversations-list">
          @for (convo of filteredConversations(); track convo.id) {
          <div
            class="conversation-item"
            [class.active]="
              convo.id === conversationService.activeConversationId()
            "
            (click)="selectConversation(convo.id); drawerVisible.set(false)"
          >
            <div class="conversation-title">{{ convo.title }}</div>
            <div class="conversation-date">
              {{ formatDate(convo.updatedAt) }}
            </div>
            <p-button
              icon="pi pi-trash"
              [text]="true"
              [rounded]="true"
              severity="danger"
              size="small"
              class="delete-btn"
              (click)="deleteConversation($event, convo.id)"
            />
          </div>
          } @empty {
          <div class="empty-conversations">
            @if (searchQuery()) {
            <i class="pi pi-search"></i>
            <span>No matching conversations</span>
            } @else {
            <i class="pi pi-comments"></i>
            <span>No conversations yet</span>
            }
          </div>
          }
        </div>
        <div class="sidebar-footer">
          <a
            class="nav-link"
            routerLink="/control-panel"
            (click)="drawerVisible.set(false)"
          >
            <i class="pi pi-sliders-h"></i>
            <span>Control Panel</span>
          </a>
          <a
            class="nav-link"
            routerLink="/settings"
            (click)="drawerVisible.set(false)"
          >
            <i class="pi pi-cog"></i>
            <span>Settings</span>
          </a>
        </div>
      </div>
    </p-drawer>

    <!-- Desktop Sidebar -->
    <aside class="desktop-sidebar">
      <div class="sidebar-brand">
        <i class="pi pi-sparkles brand-icon"></i>
        <span class="brand-text">AI Chat</span>
      </div>
      <div class="sidebar-content">
        <p-button
          label="New Chat"
          icon="pi pi-plus"
          severity="primary"
          [style]="{ width: '100%' }"
          (click)="newChat()"
        />
        <div class="search-box">
          <span class="p-input-icon-left search-input-wrapper">
            <i class="pi pi-search"></i>
            <input
              #searchInput
              pInputText
              [(ngModel)]="searchQuery"
              placeholder="Search... (⌘K)"
              class="search-input"
            />
            @if (searchQuery()) {
            <button
              class="search-clear"
              (click)="searchQuery.set('')"
            >
              <i class="pi pi-times"></i>
            </button>
            }
          </span>
        </div>
        <div class="conversations-list">
          @for (convo of filteredConversations(); track convo.id) {
          <div
            class="conversation-item"
            [class.active]="
              convo.id === conversationService.activeConversationId()
            "
            (click)="selectConversation(convo.id)"
          >
            <div class="conversation-title">{{ convo.title }}</div>
            <div class="conversation-date">
              {{ formatDate(convo.updatedAt) }}
            </div>
            <p-button
              icon="pi pi-trash"
              [text]="true"
              [rounded]="true"
              severity="danger"
              size="small"
              class="delete-btn"
              (click)="deleteConversation($event, convo.id)"
            />
          </div>
          } @empty {
          <div class="empty-conversations">
            @if (searchQuery()) {
            <i class="pi pi-search"></i>
            <span>No matching conversations</span>
            } @else {
            <i class="pi pi-comments"></i>
            <span>No conversations yet</span>
            }
          </div>
          }
        </div>
        <div class="sidebar-footer">
          <a class="nav-link" routerLink="/control-panel">
            <i class="pi pi-sliders-h"></i>
            <span>Control Panel</span>
          </a>
          <a class="nav-link" routerLink="/settings">
            <i class="pi pi-cog"></i>
            <span>Settings</span>
          </a>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      background: var(--p-surface-950);
      color: var(--p-text-color);
    }

    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 48px;
      background: var(--p-surface-900);
      border-bottom: 1px solid var(--p-surface-700);
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      gap: 8px;
      z-index: 100;
    }

    .mobile-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      color: var(--p-primary-color);
    }

    .desktop-sidebar {
      width: 260px;
      min-width: 260px;
      height: 100vh;
      height: 100dvh;
      background: var(--p-surface-900);
      border-right: 1px solid var(--p-surface-700);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px;
      flex-shrink: 0;
    }

    .brand-icon {
      font-size: 1.3rem;
      color: var(--p-primary-color);
    }

    .brand-text {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--p-text-color);
    }

    .sidebar-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      padding: 0 12px;
      gap: 12px;
    }

    .conversations-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 -4px;
      padding: 0 4px;
    }

    .search-box {
      flex-shrink: 0;
    }

    .search-input-wrapper {
      display: flex;
      align-items: center;
      position: relative;
      width: 100%;

      > i.pi-search {
        position: absolute;
        left: 10px;
        color: var(--p-text-muted-color);
        font-size: 0.82rem;
        z-index: 1;
        pointer-events: none;
      }
    }

    .search-input {
      width: 100%;
      font-size: 0.82rem;
      padding-left: 32px !important;
      padding-right: 28px !important;
      background: var(--p-surface-800) !important;
      border-color: var(--p-surface-700) !important;
    }

    .search-clear {
      position: absolute;
      right: 6px;
      background: none;
      border: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      border-radius: 50%;

      &:hover {
        color: var(--p-text-color);
        background: var(--p-surface-700);
      }

      i { font-size: 0.7rem; }
    }

    .conversation-item {
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;

      &:hover {
        background: var(--p-surface-800);
      }

      &:hover .delete-btn {
        opacity: 1;
      }

      &.active {
        background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
      }
    }

    .conversation-title {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 24px;
    }

    .conversation-date {
      font-size: 0.7rem;
      color: var(--p-text-muted-color);
      margin-top: 2px;
    }

    .delete-btn {
      position: absolute;
      top: 6px;
      right: 4px;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .empty-conversations {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px 16px;
      color: var(--p-text-muted-color);
      font-size: 0.85rem;

      i {
        font-size: 1.5rem;
        opacity: 0.5;
      }
    }

    .sidebar-footer {
      flex-shrink: 0;
      padding: 8px 0 12px;
      border-top: 1px solid var(--p-surface-700);
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      text-decoration: none;
      transition: all 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
        color: var(--p-text-color);
      }
    }

    .main-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 768px) {
      .mobile-header {
        display: flex;
      }

      .desktop-sidebar {
        display: none;
      }

      .main-content {
        padding-top: 48px;
      }
    }

    :host ::ng-deep .sidebar-drawer {
      .p-drawer-content {
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    }
  `,
})
export class LayoutComponent {
  readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);
  drawerVisible = signal(false);
  searchQuery = signal('');

  readonly sortedConversations = computed(() =>
    [...this.conversationService.conversations()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    )
  );

  readonly filteredConversations = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sorted = this.sortedConversations();
    if (!query) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.displayMessages.some((m) => m.content.toLowerCase().includes(query))
    );
  });

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const isMeta = event.metaKey || event.ctrlKey;
    if (isMeta && event.key === 'k') {
      event.preventDefault();
      const el = document.querySelector<HTMLInputElement>('.search-input');
      if (el) {
        el.focus();
        el.select();
      }
    }
    if (isMeta && event.key === 'n') {
      event.preventDefault();
      this.newChat();
    }
  }

  newChat(): void {
    const convo = this.conversationService.createConversation();
    this.router.navigate(['/chat', convo.id]);
  }

  selectConversation(id: string): void {
    this.conversationService.setActiveConversation(id);
    this.router.navigate(['/chat', id]);
  }

  deleteConversation(event: Event, id: string): void {
    event.stopPropagation();
    this.conversationService.deleteConversation(id);
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
