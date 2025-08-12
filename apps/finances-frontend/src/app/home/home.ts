import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'fin-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatCard, MatCardContent, MatIcon, RouterLink],
  styleUrl: './home.component.scss',
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="home-container">
          <div class="hero-section">
            <div class="logo">
              <mat-icon class="logo-icon" fontIcon="fa-wallet" />
            </div>
            <h1 class="hero-title">Finances</h1>
            <p class="hero-subtitle">
              Take control of your financial future with our comprehensive
              tracking and analysis tools.
            </p>
          </div>

          <mat-card class="action-card">
            <mat-card-content>
              <h2>Get Started</h2>
              <div class="action-buttons">
                <button
                  [routerLink]="['/register']"
                  mat-raised-button
                  color="primary"
                  class="primary-action"
                >
                  <mat-icon fontIcon="fa-user-plus" />
                  Create Account
                </button>
                <button
                  [routerLink]="['/login']"
                  mat-stroked-button
                  color="primary"
                  class="secondary-action"
                >
                  <mat-icon fontIcon="fa-right-to-bracket" />
                  Sign In
                </button>
              </div>
            </mat-card-content>
          </mat-card>

          <div class="features">
            <div class="feature">
              <mat-icon fontIcon="fa-chart-line" />
              <span>Track Expenses</span>
            </div>
            <div class="feature">
              <mat-icon fontIcon="fa-shield-halved" />
              <span>Secure & Private</span>
            </div>
            <div class="feature">
              <mat-icon fontIcon="fa-lightbulb" />
              <span>Smart Insights</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HomePage {}
