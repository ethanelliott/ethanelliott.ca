import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIcon, RouterLink],
  styleUrl: './home.component.scss',
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="home-grid">
          <!-- Left Content -->
          <div class="content-side">
            <div class="brand-badge">
              <mat-icon>account_balance_wallet</mat-icon>
              <span>Finances</span>
            </div>

            <h1 class="hero-title">
              Master your money,<br />
              <span class="highlight">effortlessly.</span>
            </h1>

            <p class="hero-subtitle">
              The modern way to track expenses, manage budgets, and reach your
              financial goals without the headache.
            </p>

            <div class="action-buttons">
              <button
                [routerLink]="['/register']"
                mat-flat-button
                color="primary"
                class="primary-action"
              >
                Get Started
                <mat-icon iconPosition="end">arrow_forward</mat-icon>
              </button>
              <button
                [routerLink]="['/login']"
                mat-stroked-button
                class="secondary-action"
              >
                Sign In
              </button>
            </div>
          </div>

          <!-- Right Visual -->
          <div class="visual-side">
            <div class="abstract-card main-card">
              <div class="card-header">
                <div class="circle"></div>
                <div class="line"></div>
              </div>
              <div class="card-body">
                <div class="graph-area">
                  <div class="bar" style="height: 40%"></div>
                  <div class="bar" style="height: 70%"></div>
                  <div class="bar" style="height: 50%"></div>
                  <div class="bar active" style="height: 85%"></div>
                  <div class="bar" style="height: 60%"></div>
                </div>
              </div>
            </div>
            <div class="abstract-card float-card">
              <mat-icon class="check-icon">check_circle</mat-icon>
              <div class="float-content">
                <div class="line sm"></div>
                <div class="line xs"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HomePage {}
