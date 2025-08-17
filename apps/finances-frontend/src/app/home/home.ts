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
              <mat-icon class="logo-icon">account_balance_wallet</mat-icon>
            </div>
            <h1 class="hero-title">Finances</h1>
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
                  <mat-icon>person_add</mat-icon>
                  Create Account
                </button>
                <button
                  [routerLink]="['/login']"
                  mat-stroked-button
                  color="primary"
                  class="secondary-action"
                >
                  <mat-icon>login</mat-icon>
                  Sign In
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      </div>
    </div>
  `,
})
export class HomePage {}
