import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { Transaction } from '../../services/finance-api.service';
import { TransactionsService } from '../../services/transactions.service';

// Register Chart.js components
Chart.register(...registerables);

interface OverviewStats {
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
  transactionCount: number;
  topCategory: string;
  topMedium: string;
}

interface MonthComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatProgressBarModule,
    BaseChartDirective,
  ],
})
export class OverviewComponent {
  readonly transactionsService = inject(TransactionsService);
  private readonly router = inject(Router);

  // Chart options
  readonly chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return '$' + Number(value).toLocaleString();
          },
        },
      },
    },
  };

  readonly pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
    },
  };

  // Computed values based on the transactions service
  readonly stats = computed(() => {
    const transactions = this.transactionsService.transactions();
    const income = this.transactionsService.totalIncome();
    const expenses = this.transactionsService.totalExpenses();

    // Find most common category and medium
    const categoryCount = new Map<string, number>();
    const mediumCount = new Map<string, number>();

    transactions.forEach((t) => {
      if (t.type === 'EXPENSE') {
        // Only count expense categories for "top category"
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
      }
      mediumCount.set(t.medium, (mediumCount.get(t.medium) || 0) + 1);
    });

    const topCategory =
      [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const topMedium =
      [...mediumCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netWorth: this.transactionsService.netAmount(),
      transactionCount: this.transactionsService.transactionCount(),
      topCategory,
      topMedium,
    };
  });

  readonly recentTransactions = computed(() => {
    return this.transactionsService
      .transactions()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  });

  readonly loading = computed(() => this.transactionsService.loading());

  // Monthly comparisons
  readonly monthlyIncomeComparison = computed(() => {
    const current = this.transactionsService.currentMonthIncome();
    const previous = this.transactionsService
      .previousMonthTransactions()
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);

    return this.calculateComparison(current, previous);
  });

  readonly monthlyExpenseComparison = computed(() => {
    const current = this.transactionsService.currentMonthExpenses();
    const previous = this.transactionsService.previousMonthExpenses();

    return this.calculateComparison(current, previous);
  });

  // Chart data
  readonly monthlyTrendsChartData = computed(() => {
    const trends = this.transactionsService.monthlyTrends();

    return {
      labels: trends.map((t) => t.month),
      datasets: [
        {
          label: 'Income',
          data: trends.map((t) => t.income),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4,
        },
        {
          label: 'Expenses',
          data: trends.map((t) => t.expenses),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
        },
        {
          label: 'Net',
          data: trends.map((t) => t.net),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
        },
      ],
    };
  });

  readonly categoryChartData = computed(() => {
    const breakdown = this.transactionsService.currentMonthCategoryBreakdown();

    return {
      labels: breakdown.map((c) => c.category),
      datasets: [
        {
          data: breakdown.map((c) => c.amount),
          backgroundColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF',
            '#FF9F40',
            '#FF6384',
            '#C9CBCF',
            '#4BC0C0',
            '#FF6384',
          ],
        },
      ],
    };
  });

  private calculateComparison(
    current: number,
    previous: number
  ): MonthComparison {
    const change = current - previous;
    const changePercent = previous === 0 ? 0 : (change / previous) * 100;

    return {
      current,
      previous,
      change,
      changePercent,
    };
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  }

  getHealthScoreClass(): string {
    const score = this.transactionsService.financialHealthScore();
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  getHealthScoreDescription(): string {
    const score = this.transactionsService.financialHealthScore();
    if (score >= 80) return 'Excellent financial health!';
    if (score >= 60) return 'Good financial position';
    if (score >= 40) return 'Room for improvement';
    return 'Needs attention';
  }

  getChangeClass(changePercent: number): string {
    if (changePercent > 0) return 'positive-change';
    if (changePercent < 0) return 'negative-change';
    return 'no-change';
  }

  getChangeText(comparison: MonthComparison): string {
    if (comparison.changePercent === 0) return 'No change';
    const direction = comparison.changePercent > 0 ? '+' : '';
    return `${direction}${comparison.changePercent.toFixed(1)}% vs last month`;
  }

  getAverageMonthlySpending(): number {
    const trends = this.transactionsService.monthlyTrends();
    if (trends.length === 0) return 0;

    return (
      trends.reduce((sum, month) => sum + month.expenses, 0) / trends.length
    );
  }

  getAverageTransactionAmount(): number {
    const transactions = this.transactionsService.transactions();
    if (transactions.length === 0) return 0;

    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    return totalAmount / transactions.length;
  }

  getMostActiveDay(): string {
    const transactions = this.transactionsService.transactions();
    const dayCount = new Map<string, number>();

    transactions.forEach((t) => {
      const day = new Date(t.date).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    });

    const mostActive = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return mostActive ? mostActive[0] : 'No data';
  }

  navigateToTransactions() {
    this.router.navigate(['/dashboard/transactions']);
  }

  navigateToCategories() {
    this.router.navigate(['/dashboard/categories']);
  }

  navigateToMediums() {
    this.router.navigate(['/dashboard/mediums']);
  }

  navigateToTags() {
    this.router.navigate(['/dashboard/tags']);
  }
}
