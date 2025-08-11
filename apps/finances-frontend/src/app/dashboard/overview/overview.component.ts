import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { AllTimeOverviewComponent } from './all-time-overview.component';
import { MonthlyHabitsComponent } from './monthly-habits/monthly-habits.component';

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overview-container">
      <div class="header-section">
        <div class="header-content">
          <div class="title-section">
            <h1>Financial Overview</h1>
            <p>Choose your view to analyze your financial data</p>
          </div>
        </div>
      </div>

      <mat-tab-group
        [selectedIndex]="selectedTab()"
        (selectedIndexChange)="onTabChange($event)"
        class="overview-tabs"
      >
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon fontIcon="fa-chart-line"></mat-icon>
            All-Time Overview
          </ng-template>
          <app-all-time-overview></app-all-time-overview>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon fontIcon="fa-calendar-days"></mat-icon>
            Monthly Habits
          </ng-template>
          <app-monthly-habits></app-monthly-habits>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .overview-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .header-section {
      padding: 24px 24px 0 24px;
      background: var(--mat-sys-surface);
    }

    .header-content {
      max-width: 1400px;
      margin: 0 auto;
    }

    .title-section h1 {
      margin: 0 0 8px 0;
      color: var(--mat-sys-on-surface);
      font-weight: 600;
      font-size: 2rem;
    }

    .title-section p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 1rem;
    }

    .overview-tabs {
      flex: 1;
      margin: 24px;
      background: var(--mat-sys-surface-container-low);
      border-radius: 16px;
      overflow: hidden;
    }

    .overview-tabs ::ng-deep .mat-mdc-tab-header {
      background: var(--mat-sys-surface-container-high);
    }

    .overview-tabs ::ng-deep .mat-mdc-tab-body-wrapper {
      flex: 1;
      overflow: auto;
    }

    .overview-tabs ::ng-deep .mat-mdc-tab-body-content {
      height: 100%;
      overflow: auto;
    }

    .overview-tabs ::ng-deep .mat-mdc-tab .mdc-tab__text-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    @media (max-width: 768px) {
      .header-section {
        padding: 16px 16px 0 16px;
      }

      .overview-tabs {
        margin: 16px;
      }

      .title-section h1 {
        font-size: 1.5rem;
      }

      .overview-tabs ::ng-deep .mat-mdc-tab .mdc-tab__text-label mat-icon {
        display: none;
      }
    }
  `,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    AllTimeOverviewComponent,
    MonthlyHabitsComponent,
  ],
})
export class OverviewComponent implements OnInit {
  private readonly router = inject(Router);

  readonly selectedTab = signal(0);

  ngOnInit() {
    // Check if there's a specific tab requested in the URL or local storage
    const savedTab = localStorage.getItem('overview-selected-tab');
    if (savedTab) {
      this.selectedTab.set(parseInt(savedTab, 10));
    }
  }

  onTabChange(index: number) {
    this.selectedTab.set(index);
    localStorage.setItem('overview-selected-tab', index.toString());
  }
}
