import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { Transaction } from '../../../services/finance-api.service';
import { injectFinanceStore } from '../../../store/finance.provider';

// Register Chart.js components
Chart.register(...registerables);

interface MonthlyStats {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  transactionCount: number;
  topCategory: string;
  topMedium: string;
  avgTransactionAmount: number;
  mostActiveDay: string;
}

@Component({
  selector: 'app-monthly-habits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monthly-habits.component.html',
  styleUrl: './monthly-habits.component.scss',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    BaseChartDirective,
  ],
})
export class MonthlyHabitsComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly router = inject(Router);

  // Current selected month/year
  readonly selectedMonth = signal(new Date().getMonth());
  readonly selectedYear = signal(new Date().getFullYear());

  ngOnInit() {
    // Load all data when component initializes
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }
  }

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

  // Computed values for selected month
  readonly filteredTransactions = computed(() => {
    const transactions = this.financeStore.transactions();
    const month = this.selectedMonth();
    const year = this.selectedYear();

    return transactions.filter((t) => {
      const date = new Date(t.date);
      return date.getMonth() === month && date.getFullYear() === year;
    });
  });

  readonly monthlyStats = computed(() => {
    const transactions = this.filteredTransactions();
    const income = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    // Find most common category and medium
    const categoryCount = new Map<string, number>();
    const mediumCount = new Map<string, number>();
    const dayCount = new Map<string, number>();

    transactions.forEach((t) => {
      if (t.type === 'EXPENSE') {
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
      }
      mediumCount.set(t.medium, (mediumCount.get(t.medium) || 0) + 1);

      const day = new Date(t.date).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    });

    const topCategory =
      [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const topMedium =
      [...mediumCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const mostActiveDay =
      [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const avgTransactionAmount =
      transactions.length > 0
        ? transactions.reduce((sum, t) => sum + t.amount, 0) /
          transactions.length
        : 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netAmount: income - expenses,
      transactionCount: transactions.length,
      topCategory,
      topMedium,
      avgTransactionAmount,
      mostActiveDay,
    };
  });

  readonly categoryBreakdown = computed(() => {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const breakdown = new Map<string, number>();

    transactions.forEach((t) => {
      breakdown.set(t.category, (breakdown.get(t.category) || 0) + t.amount);
    });

    return Array.from(breakdown.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  readonly mediumBreakdown = computed(() => {
    const transactions = this.filteredTransactions();
    const breakdown = new Map<
      string,
      { income: number; expenses: number; count: number }
    >();

    transactions.forEach((t) => {
      const current = breakdown.get(t.medium) || {
        income: 0,
        expenses: 0,
        count: 0,
      };
      if (t.type === 'INCOME') {
        current.income += t.amount;
      } else {
        current.expenses += t.amount;
      }
      current.count++;
      breakdown.set(t.medium, current);
    });

    return Array.from(breakdown.entries())
      .map(([medium, data]) => ({ medium, ...data }))
      .sort((a, b) => b.income + b.expenses - (a.income + a.expenses));
  });

  readonly weeklySpendingPattern = computed(() => {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const weekPattern = new Map<string, number>();

    transactions.forEach((t) => {
      const date = new Date(t.date);
      const weekNumber = Math.floor(date.getDate() / 7) + 1;
      const key = `Week ${weekNumber}`;
      weekPattern.set(key, (weekPattern.get(key) || 0) + t.amount);
    });

    const labels = Array.from(weekPattern.keys()).sort();
    return {
      labels,
      datasets: [
        {
          label: 'Weekly Spending',
          data: labels.map((label) => weekPattern.get(label) || 0),
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 2,
        },
      ],
    };
  });

  readonly categoryChartData = computed(() => {
    const breakdown = this.categoryBreakdown();

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

  readonly loading = computed(() => this.financeStore.loading());

  // Available months/years for selection
  readonly availableMonths = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' },
  ];

  readonly availableYears = computed(() => {
    const transactions = this.financeStore.transactions();
    const years = new Set<number>();

    transactions.forEach((t) => {
      years.add(new Date(t.date).getFullYear());
    });

    // Add current year if no transactions exist
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }

    return Array.from(years).sort((a, b) => b - a);
  });

  // Methods
  onMonthChange(month: number) {
    this.selectedMonth.set(month);
  }

  onYearChange(year: number) {
    this.selectedYear.set(year);
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

  getSelectedMonthName(): string {
    return this.availableMonths[this.selectedMonth()].label;
  }

  navigateToTransactions() {
    this.router.navigate(['/dashboard/transactions']);
  }

  navigateToOverview() {
    this.router.navigate(['/dashboard/all-time']);
  }

  getSpendingTrend(): string {
    const breakdown = this.categoryBreakdown();
    if (breakdown.length === 0) return 'No spending data';

    const totalSpending = breakdown.reduce((sum, cat) => sum + cat.amount, 0);
    const avgDaily =
      totalSpending /
      new Date(this.selectedYear(), this.selectedMonth() + 1, 0).getDate();

    return `$${avgDaily.toFixed(2)} avg/day`;
  }

  getTopSpendingDays(): { day: string; amount: number }[] {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const dailySpending = new Map<string, number>();

    transactions.forEach((t) => {
      const date = new Date(t.date).getDate().toString();
      dailySpending.set(date, (dailySpending.get(date) || 0) + t.amount);
    });

    return Array.from(dailySpending.entries())
      .map(([day, amount]) => ({ day, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }
}
