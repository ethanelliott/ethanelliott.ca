import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { injectFinanceStore } from '../../store/finance.provider';
import { DialogService } from '../../shared/dialogs';

interface TagData {
  name: string;
  usageCount: number;
  created: Date;
}

@Component({
  selector: 'app-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatMenuModule,
    MatTooltipModule,
    MatCheckboxModule,
  ],
  styleUrl: './tags.component.scss',
  template: `
    <div class="tags-container">
      <!-- Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon>sell</mat-icon>
              Tags
            </h1>
            <p class="page-subtitle">
              Manage and organize your transaction tags efficiently
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>sell</mat-icon>
                <span>{{ financeStore.tags().length }} Total</span>
              </div>
              <div class="stat-chip">
                <mat-icon>filter_alt</mat-icon>
                <span>{{ filteredTagsCount() }} Shown</span>
              </div>
            </div>
            <button
              mat-raised-button
              (click)="forceLoadData()"
              class="debug-button"
            >
              <mat-icon>refresh</mat-icon>
              Force Load Data
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-content>
          <div class="quick-add-form">
            <mat-form-field appearance="outline" class="tag-input">
              <mat-label>Add New Tag</mat-label>
              <input
                matInput
                [formControl]="tagControl"
                placeholder="e.g., urgent, business, recurring"
                (keydown.enter)="addTag()"
              />
              <mat-icon matSuffix>sell</mat-icon>
            </mat-form-field>
            <button
              mat-raised-button
              color="primary"
              (click)="addTag()"
              [disabled]="!tagControl.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Add Tag } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Tag
              </ng-container>
              }
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Search and Filter -->
      <mat-card class="search-filter-card">
        <mat-card-content>
          <div class="search-controls">
            <mat-form-field appearance="outline" class="search-field">
              <mat-label>Search tags</mat-label>
              <input
                matInput
                [formControl]="searchControl"
                placeholder="Type to search..."
              />
              <mat-icon matPrefix>search</mat-icon>
              @if (searchControl.value) {
              <button matSuffix mat-icon-button (click)="clearSearch()">
                <mat-icon>close</mat-icon>
              </button>
              }
            </mat-form-field>
            <div class="bulk-actions">
              <button
                mat-stroked-button
                [matMenuTriggerFor]="bulkMenu"
                [disabled]="selectedTags().size === 0"
                class="bulk-action-button"
              >
                <mat-icon>more_vert</mat-icon>
                Bulk Actions ({{ selectedTags().size }})
              </button>
              <mat-menu #bulkMenu="matMenu">
                <button mat-menu-item (click)="deleteSelectedTags()">
                  <mat-icon>delete</mat-icon>
                  Delete Selected
                </button>
                <button mat-menu-item (click)="clearSelection()">
                  <mat-icon>check_box_outline_blank</mat-icon>
                  Clear Selection
                </button>
              </mat-menu>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Tags Table -->
      <mat-card class="tags-table-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            All Tags
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <h3>Loading tags...</h3>
            <p>Please wait while we fetch your tag data</p>
          </div>
          } @else if (financeStore.tags().length === 0) {
          <div class="empty-state">
            <mat-icon>sell</mat-icon>
            <h3>No tags yet</h3>
            <p>
              Add your first tag above to start organizing your transactions
            </p>
          </div>
          } @else {
          <div class="table-container">
            <table
              mat-table
              [dataSource]="dataSource"
              matSort
              class="tags-table"
            >
              <!-- Select Column -->
              <ng-container matColumnDef="select">
                <th mat-header-cell *matHeaderCellDef>
                  <mat-checkbox
                    [checked]="isAllSelected()"
                    [indeterminate]="isPartiallySelected()"
                    (change)="toggleAllSelection()"
                  ></mat-checkbox>
                </th>
                <td mat-cell *matCellDef="let tag">
                  <mat-checkbox
                    [checked]="selectedTags().has(tag.name)"
                    (change)="toggleTagSelection(tag.name)"
                  ></mat-checkbox>
                </td>
              </ng-container>

              <!-- Tag Name Column -->
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>
                  Tag Name
                </th>
                <td mat-cell *matCellDef="let tag" class="tag-name-cell">
                  <div class="tag-display">
                    <mat-icon class="tag-icon">sell</mat-icon>
                    <span class="tag-text">{{ tag.name }}</span>
                  </div>
                </td>
              </ng-container>

              <!-- Usage Count Column -->
              <ng-container matColumnDef="usage">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>
                  Usage Count
                </th>
                <td mat-cell *matCellDef="let tag" class="usage-cell">
                  <div class="usage-info">
                    <span class="usage-count">{{ tag.usageCount || 0 }}</span>
                    <span class="usage-label">transactions</span>
                  </div>
                </td>
              </ng-container>

              <!-- Created Date Column -->
              <ng-container matColumnDef="created">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>
                  Created
                </th>
                <td mat-cell *matCellDef="let tag" class="date-cell">
                  {{ formatDate(tag.created) }}
                </td>
              </ng-container>

              <!-- Actions Column -->
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef class="actions-header">
                  Actions
                </th>
                <td mat-cell *matCellDef="let tag" class="actions-cell">
                  <button
                    mat-icon-button
                    [matTooltip]="'Delete ' + tag.name"
                    (click)="deleteTag(tag.name)"
                    [disabled]="deleting().has(tag.name)"
                    class="delete-button"
                  >
                    @if (deleting().has(tag.name)) {
                    <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                    <mat-icon>delete</mat-icon>
                    }
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>

            <!-- Paginator -->
            <mat-paginator
              #paginator
              [pageSizeOptions]="[25, 50, 100, 200]"
              [pageSize]="50"
              showFirstLastButtons
              class="tags-paginator"
            ></mat-paginator>
          </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Quick Add Suggestions -->
      <mat-card class="suggestions-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>lightbulb</mat-icon>
            Common Tags
          </mat-card-title>
          <mat-card-subtitle>
            Click to quickly add popular tags
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="suggestions-grid">
            @for (suggestion of availableSuggestions(); track suggestion) {
            <mat-chip
              (click)="addSuggestedTag(suggestion)"
              [disabled]="submitting()"
              class="suggestion-chip"
            >
              <mat-icon matChipAvatar>add</mat-icon>
              {{ suggestion }}
            </mat-chip>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class TagsComponent implements OnInit, AfterViewInit {
  readonly financeStore = injectFinanceStore();
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  selectedTags = signal(new Set<string>());

  tagControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
  ]);

  searchControl = new FormControl('');

  // Table configuration
  displayedColumns: string[] = [
    'select',
    'name',
    'usage',
    'created',
    'actions',
  ];
  dataSource = new MatTableDataSource<TagData>();

  // Computed properties
  filteredTagsCount = computed(() => this.dataSource.filteredData.length);

  availableSuggestions = computed(() => {
    const existingTags = new Set(this.financeStore.tags());
    return this.commonTags.filter((tag) => !existingTags.has(tag));
  });

  commonTags = [
    'urgent',
    'business',
    'personal',
    'recurring',
    'one-time',
    'planned',
    'unexpected',
    'essential',
    'luxury',
    'investment',
    'debt',
    'savings',
    'emergency',
    'tax-deductible',
    'reimbursable',
    'gift',
    'subscription',
    'utility',
    'maintenance',
    'health',
  ];

  constructor() {
    // Watch for search changes
    this.searchControl.valueChanges.subscribe((searchValue) => {
      this.dataSource.filter = (searchValue || '').trim().toLowerCase();
    });

    // Watch for changes in the finance store tags and update the table
    effect(() => {
      const tags = this.financeStore.tags();
      console.log('Finance store tags changed:', tags); // Debug log
      this.updateDataSource();
    });

    // Also log the initial state
    console.log('Initial financeStore state:', {
      tags: this.financeStore.tags(),
      loading: this.financeStore.loading(),
      initialLoadComplete: this.financeStore.initialLoadComplete(),
    });
  }

  ngOnInit() {
    // Load data if not already loaded
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }

    this.loading.set(false);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  private updateDataSource() {
    const tags = this.financeStore.tags();
    console.log('Updating data source with tags:', tags); // Debug log

    const tagData: TagData[] = tags.map((tagName) => ({
      name: tagName,
      usageCount: this.getTagUsageCount(tagName),
      created: new Date(), // TODO: Get actual creation date from store
    }));

    console.log('Tag data for table:', tagData); // Debug log
    this.dataSource.data = tagData;
  }

  private getTagUsageCount(tagName: string): number {
    // TODO: Calculate actual usage from transactions
    return Math.floor(Math.random() * 50); // Placeholder
  }

  // Search and filter methods
  clearSearch() {
    this.searchControl.setValue('');
  }

  // Selection methods
  isAllSelected(): boolean {
    const numSelected = this.selectedTags().size;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows && numRows > 0;
  }

  isPartiallySelected(): boolean {
    const numSelected = this.selectedTags().size;
    const numRows = this.dataSource.data.length;
    return numSelected > 0 && numSelected < numRows;
  }

  toggleAllSelection() {
    if (this.isAllSelected()) {
      this.selectedTags.set(new Set());
    } else {
      const allTags = new Set(this.dataSource.data.map((tag) => tag.name));
      this.selectedTags.set(allTags);
    }
  }

  toggleTagSelection(tagName: string) {
    const selected = new Set(this.selectedTags());
    if (selected.has(tagName)) {
      selected.delete(tagName);
    } else {
      selected.add(tagName);
    }
    this.selectedTags.set(selected);
  }

  clearSelection() {
    this.selectedTags.set(new Set());
  }

  // Bulk operations
  async deleteSelectedTags() {
    const selected = this.selectedTags();
    if (selected.size === 0) return;

    this.dialogService
      .confirm(
        `Are you sure you want to delete ${selected.size} selected tags?`,
        'Delete Selected Tags',
        'Delete',
        'Cancel'
      )
      .subscribe(async (confirmed) => {
        if (!confirmed) return;

        for (const tagName of selected) {
          await this.deleteTag(tagName, true); // Skip individual confirmation
        }

        this.clearSelection();
      });
  }

  // Utility methods
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  addTag() {
    if (!this.tagControl.valid || !this.tagControl.value) return;

    this.submitting.set(true);
    const tagName = this.tagControl.value.trim().toLowerCase();

    this.financeStore.createTag(tagName);
    this.submitting.set(false);
    this.tagControl.reset();
    // updateDataSource() will be called automatically by the effect
  }

  addSuggestedTag(tagName: string) {
    this.submitting.set(true);
    this.financeStore.createTag(tagName);
    this.submitting.set(false);
    // updateDataSource() will be called automatically by the effect
  }

  async deleteTag(tagName: string, skipConfirmation: boolean = false) {
    if (!skipConfirmation) {
      const confirmed = await firstValueFrom(
        this.dialogService.confirm(
          `Are you sure you want to delete the tag "${tagName}"?`,
          'Delete Tag',
          'Delete',
          'Cancel'
        )
      );

      if (!confirmed) return;
    }

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(tagName);
    this.deleting.set(newDeleting);

    try {
      await this.financeStore.deleteTag(tagName);
      // updateDataSource() will be called automatically by the effect

      // Remove from selected if it was selected
      const selected = new Set(this.selectedTags());
      selected.delete(tagName);
      this.selectedTags.set(selected);
    } finally {
      // Remove from deleting set
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(tagName);
      this.deleting.set(updatedDeleting);
    }
  }

  // Debug method
  forceLoadData() {
    console.log('Force loading data...');
    this.financeStore.loadAllData();
  }
}
