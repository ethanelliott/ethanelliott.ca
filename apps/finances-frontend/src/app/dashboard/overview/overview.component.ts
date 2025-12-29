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
            <mat-icon>trending_up</mat-icon>
            All-Time Overview
          </ng-template>
          <app-all-time-overview></app-all-time-overview>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>calendar_month</mat-icon>
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
      gap: var(--spacing-lg);
    }

    .header-section {
      // padding: 0;
    }

    .header-content {
      max-width: var(--content-max-width);
      margin: 0 auto;
    }

    .title-section h1 {
      margin: 0 0 8px 0;
      font-weight: 800;
      font-size: 2.5rem;
      letter-spacing: -0.02em;
      background: linear-gradient(to right, var(--mat-sys-primary), var(--mat-sys-tertiary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .title-section p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 1.1rem;
    }

    .overview-tabs {
      flex: 1;
      background: rgba(30, 30, 30, 0.4);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: var(--surface-elevation-2);
    }

    .overview-tabs ::ng-deep .mat-mdc-tab-header {
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
      .overview-container {
        gap: var(--spacing-md);
      }

      .title-section h1 {
        font-size: 1.75rem;
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
