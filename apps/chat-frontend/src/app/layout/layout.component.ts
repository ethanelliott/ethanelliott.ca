import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
  computed,
  HostListener,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { ConversationService } from '../services/conversation.service';
import { Conversation } from '../models/types';

interface ConversationGroup {
  label: string;
  icon?: string;
  conversations: Conversation[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    NgTemplateOutlet,
    DrawerModule,
    ButtonModule,
    TooltipModule,
    InputTextModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Shared sidebar content -->
    <ng-template #sidebarContent let-closeOnAction="closeOnAction">
      <div class="sidebar-content">
        <button class="new-chat-btn" (click)="newChat(); maybeClose(closeOnAction)">
          <i class="pi pi-plus"></i>
          <span>New chat</span>
          <kbd>⌘N</kbd>
        </button>
        <div class="search-box">
          <span class="search-input-wrapper">
            <i class="pi pi-search"></i>
            <input
              pInputText
              [(ngModel)]="searchQuery"
              placeholder="Search chats…"
              class="search-input"
            />
            @if (searchQuery()) {
            <button class="search-clear" (click)="searchQuery.set('')">
              <i class="pi pi-times"></i>
            </button>
            }
          </span>
        </div>
        <div class="conversations-list">
          @for (group of groupedConversations(); track group.label) {
          <div class="group-label">
            @if (group.icon) {<i class="pi" [class]="'pi ' + group.icon"></i>}
            {{ group.label }}
          </div>
          @for (convo of group.conversations; track convo.id) {
          <div
            class="conversation-item"
            [class.active]="
              convo.id === conversationService.activeConversationId()
            "
            (click)="selectConversation(convo.id); maybeClose(closeOnAction)"
          >
            <div class="conversation-main">
              <div class="conversation-title">{{ convo.title }}</div>
              <div class="conversation-meta">
                <span>{{ formatDate(convo.updatedAt) }}</span>
                @if (convo.artifacts?.length) {
                <i class="pi pi-palette meta-icon" title="Has artifacts"></i>
                }
              </div>
            </div>
            <div class="item-actions">
              <button
                class="item-action-btn"
                [class.pinned]="convo.pinned"
                (click)="togglePin($event, convo.id)"
                [title]="convo.pinned ? 'Unpin' : 'Pin'"
              >
                <i class="pi pi-thumbtack"></i>
              </button>
              <button
                class="item-action-btn danger"
                (click)="deleteConversation($event, convo.id)"
                title="Delete"
              >
                <i class="pi pi-trash"></i>
              </button>
            </div>
          </div>
          } } @empty {
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
            routerLink="/workflows"
            (click)="maybeClose(closeOnAction)"
          >
            <i class="pi pi-sitemap"></i>
            <span>Workflows</span>
          </a>
          <a
            class="nav-link"
            routerLink="/control-panel"
            (click)="maybeClose(closeOnAction)"
          >
            <i class="pi pi-sliders-h"></i>
            <span>Control Panel</span>
          </a>
          <a
            class="nav-link"
            routerLink="/settings"
            (click)="maybeClose(closeOnAction)"
          >
            <i class="pi pi-cog"></i>
            <span>Settings</span>
          </a>
        </div>
      </div>
    </ng-template>

    <!-- Mobile Header -->
    <div class="mobile-header">
      <p-button
        icon="pi pi-bars"
        [text]="true"
        severity="secondary"
        (click)="drawerVisible.set(true)"
      />
      <span class="mobile-title">
        <span class="brand-mark small"><i class="pi pi-sparkles"></i></span>
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
          <span class="brand-mark"><i class="pi pi-sparkles"></i></span>
          <span class="brand-text">AI Chat</span>
        </div>
      </ng-template>
      <ng-container
        [ngTemplateOutlet]="sidebarContent"
        [ngTemplateOutletContext]="{ closeOnAction: true }"
      />
    </p-drawer>

    <!-- Desktop Sidebar -->
    <aside class="desktop-sidebar">
      <div class="sidebar-brand">
        <span class="brand-mark"><i class="pi pi-sparkles"></i></span>
        <span class="brand-text">AI Chat</span>
        <span class="brand-badge">local</span>
      </div>
      <ng-container
        [ngTemplateOutlet]="sidebarContent"
        [ngTemplateOutletContext]="{ closeOnAction: false }"
      />
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
      background: color-mix(in srgb, var(--p-surface-950) 85%, transparent);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--p-surface-800);
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
      color: var(--p-text-color);
    }

    .desktop-sidebar {
      width: 272px;
      min-width: 272px;
      height: 100vh;
      height: 100dvh;
      background: color-mix(in srgb, var(--p-surface-900) 55%, var(--p-surface-950));
      border-right: 1px solid var(--p-surface-800);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 16px 14px;
      flex-shrink: 0;
    }

    .brand-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--chat-gradient);
      color: white;
      box-shadow: var(--chat-glow);
      flex-shrink: 0;

      i {
        font-size: 0.95rem;
      }

      &.small {
        width: 24px;
        height: 24px;
        border-radius: 7px;

        i { font-size: 0.75rem; }
      }
    }

    .brand-text {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--p-text-color);
    }

    .brand-badge {
      font-family: var(--chat-font-mono);
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--chat-accent);
      border: 1px solid
        color-mix(in srgb, var(--p-primary-500) 40%, transparent);
      border-radius: 999px;
      padding: 2px 8px;
      margin-left: auto;
    }

    .sidebar-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      padding: 0 12px;
      gap: 10px;
    }

    .new-chat-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 14px;
      border: none;
      border-radius: var(--chat-radius-md);
      background: var(--chat-gradient);
      color: white;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.15s ease, transform 0.1s ease;

      &:hover {
        filter: brightness(1.12);
      }

      &:active {
        transform: scale(0.985);
      }

      i {
        font-size: 0.8rem;
      }

      kbd {
        margin-left: auto;
        font-size: 0.62rem;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.18);
        border-radius: 5px;
        padding: 2px 6px;
      }
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

    .group-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--p-text-muted-color);
      padding: 12px 8px 4px;

      i {
        font-size: 0.6rem;
        color: var(--chat-accent);
      }

      &:first-child {
        padding-top: 4px;
      }
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
      background: var(--p-surface-900) !important;
      border-color: var(--p-surface-800) !important;
      border-radius: var(--chat-radius-md) !important;
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
      align-items: center;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s ease;
      position: relative;
      min-width: 0;

      &:hover {
        background: var(--p-surface-800);
      }

      &:hover .item-actions {
        opacity: 1;
      }

      &.active {
        background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);

        .conversation-title {
          color: var(--p-primary-200);
        }
      }
    }

    .conversation-main {
      flex: 1;
      min-width: 0;
    }

    .conversation-title {
      font-size: 0.84rem;
      font-weight: 500;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .conversation-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      margin-top: 2px;

      .meta-icon {
        font-size: 0.6rem;
        color: var(--chat-accent);
      }
    }

    .item-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.15s ease;
      flex-shrink: 0;
    }

    .item-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      transition: color 0.15s ease, background 0.15s ease;

      i { font-size: 0.7rem; }

      &:hover {
        background: var(--p-surface-700);
        color: var(--p-text-color);
      }

      &.danger:hover {
        color: #f87171;
      }

      &.pinned {
        opacity: 1;
        color: var(--chat-accent);
      }
    }

    /* Keep the pin visible when pinned even without hover */
    .conversation-item .item-actions:has(.pinned) {
      opacity: 1;
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
      border-top: 1px solid var(--p-surface-800);
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 10px;
      font-size: 0.84rem;
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

  readonly groupedConversations = computed<ConversationGroup[]>(() => {
    const convos = this.filteredConversations();
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 6 * 86400000;

    const groups: ConversationGroup[] = [
      { label: 'Pinned', icon: 'pi-thumbtack', conversations: [] },
      { label: 'Today', conversations: [] },
      { label: 'Yesterday', conversations: [] },
      { label: 'Previous 7 days', conversations: [] },
      { label: 'Older', conversations: [] },
    ];

    for (const convo of convos) {
      if (convo.pinned) {
        groups[0].conversations.push(convo);
      } else if (convo.updatedAt >= todayStart) {
        groups[1].conversations.push(convo);
      } else if (convo.updatedAt >= yesterdayStart) {
        groups[2].conversations.push(convo);
      } else if (convo.updatedAt >= weekStart) {
        groups[3].conversations.push(convo);
      } else {
        groups[4].conversations.push(convo);
      }
    }

    return groups.filter((g) => g.conversations.length > 0);
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

  maybeClose(closeOnAction: boolean): void {
    if (closeOnAction) {
      this.drawerVisible.set(false);
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

  togglePin(event: Event, id: string): void {
    event.stopPropagation();
    this.conversationService.togglePin(id);
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
