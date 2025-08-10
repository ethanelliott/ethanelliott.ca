import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'fin-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatCard, MatCardContent, MatIcon, RouterLink],
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="home-container">
          <div class="hero-section">
            <div class="logo">
              <mat-icon class="logo-icon" fontIcon="fa-wallet" />
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
        </div>
      </div>
    </div>
  `,
  styles: `
    .gradient-background {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, 
        #0f1419 0%, 
        #1a2e2c 25%, 
        #2d4a3b 50%, 
        #1e3a32 75%, 
        #121b1f 100%);
      overflow: hidden;
    }

    .wrapper {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 20px;
    }

    .home-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 48px;
      width: 100%;
      max-width: 800px;
    }

    .hero-section {
      text-align: center;
      color: white;
    }

    .logo {
      margin-bottom: 24px;
    }

    .logo-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-primary);
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
    }

    .hero-title {
      font-size: 3.5rem;
      font-weight: 300;
      margin: 0 0 16px 0;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    }

    .action-card {
      width: 100%;
      max-width: 420px;
      backdrop-filter: blur(20px);
      border: 1px solid var(--mat-sys-outline-variant);
      overflow: hidden;
    }

    .action-card h2 {
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      text-align: center;
    }

    .action-buttons {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
    }

    .primary-action,
    .secondary-action {
      gap: 8px;
      font-size: 1rem;
      width: 100%;
    }

    @media (max-width: 768px) {
      .home-container {
        padding: 0 16px;
        gap: 32px;
      }

      .hero-title {
        font-size: 2.5rem;
      }

      .hero-subtitle {
        font-size: 1.1rem;
      }

      .features {
        flex-direction: column;
        gap: 24px;
      }

      .feature {
        flex-direction: row;
        justify-content: center;
      }

      .action-card {
        margin: 0;
      }

      .action-buttons {
        gap: 12px;
      }
    }

    @media (max-width: 480px) {
      .hero-title {
        font-size: 2rem;
      }

      .features {
        gap: 16px;
      }

      .feature mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
        padding: 8px;
      }
    }
  `,
})
export class HomePage {}
