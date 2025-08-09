import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'fin-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatCard, RouterLink],
  template: `<div class="wrapper">
    <mat-card class="container">
      <h1>Finances</h1>
      <div class="action-wrapper">
        <button [routerLink]="['/register']" mat-button>Register</button>
        <button [routerLink]="['/login']" mat-flat-button>Login</button>
      </div>
    </mat-card>
  </div>`,
  styles: `
  .wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    align-items: center;
    justify-content: center;
  }
  
  .container {
    display: flex;
    flex-direction: column;
    align-items:center;
    justify-content: center;
    gap: 2rem;
    padding: 2rem;
    min-width: 400px;
    width: 20vw;
  }

  .action-wrapper {
    display: flex;
    align-items: center;
    gap: 2rem;
  }
  
  `,
})
export class HomePage {}
