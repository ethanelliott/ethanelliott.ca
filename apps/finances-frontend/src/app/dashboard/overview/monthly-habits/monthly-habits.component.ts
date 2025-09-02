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
import {
  isDateInMonth,
  getDateDay,
  getDateYear,
  getDateMonth,
  getWeekdayName,
  formatAbsoluteDate,
} from '../../../utils/date-utils';

// Register Chart.js components
Chart.register(...registerables);

interface MonthlyStats {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  transactionCount: number;
  topCategory: string;
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

  // Enhanced chart options with modern styling - matching all-time overview
  readonly chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 12,
          font: {
            size: 10,
            weight: 'bold',
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          size: 12,
          weight: 'bold',
        },
        bodyFont: {
          size: 11,
        },
        padding: 8,
        cornerRadius: 6,
        displayColors: true,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${this.formatCurrency(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 9,
            weight: 'normal',
          },
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          font: {
            size: 9,
            weight: 'normal',
          },
          maxTicksLimit: 6,
          callback: function (value) {
            return '$' + Number(value).toLocaleString();
          },
        },
      },
    },
    elements: {
      line: {
        tension: 0.4,
        borderWidth: 2,
      },
      point: {
        radius: 3,
        hoverRadius: 5,
        borderWidth: 1,
      },
    },
  };

  readonly pieChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 8,
          font: {
            size: 10,
            weight: 'normal',
          },
          generateLabels: (chart: any) => {
            const data = chart.data;
            if (data.labels?.length && data.datasets.length) {
              return data.labels.map((label: string, i: number) => {
                const dataset = data.datasets[0];
                const value = dataset.data[i] as number;
                const total = (dataset.data as number[]).reduce(
                  (a: number, b: number) => a + b,
                  0
                );
                const percentage = ((value / total) * 100).toFixed(1);
                const colors = dataset.backgroundColor as string[];

                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: colors?.[i] || '#000',
                  strokeStyle: colors?.[i] || '#000',
                  fontColor: '#ffffff',
                  lineWidth: 0,
                  pointStyle: 'circle',
                  index: i,
                };
              });
            }
            return [];
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          size: 12,
          weight: 'bold',
        },
        bodyFont: {
          size: 11,
        },
        padding: 8,
        cornerRadius: 6,
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed;
            const total = (context.dataset.data as number[]).reduce(
              (a: number, b: number) => a + b,
              0
            );
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${this.formatCurrency(value)} (${percentage}%)`;
          },
        },
      },
    },
    cutout: '60%',
  };

  // Computed values for selected month
  readonly filteredTransactions = computed(() => {
    const transactions = this.financeStore.transactions();
    const month = this.selectedMonth();
    const year = this.selectedYear();

    return transactions.filter((t) => {
      return isDateInMonth(t.date, year, month);
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

    // Find most common category
    const categoryCount = new Map<string, number>();
    const dayCount = new Map<string, number>();

    transactions.forEach((t) => {
      if (t.type === 'EXPENSE') {
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
      }

      // Use date utilities to get weekday name consistently
      const weekday = getWeekdayName(t.date);
      dayCount.set(weekday, (dayCount.get(weekday) || 0) + 1);
    });

    const topCategory =
      [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
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

  readonly weeklySpendingPattern = computed(() => {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const weekPattern = new Map<string, number>();

    transactions.forEach((t) => {
      const day = getDateDay(t.date);
      const weekNumber = Math.floor((day - 1) / 7) + 1;
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
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: '#ef4444',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  });

  readonly categoryChartData = computed(() => {
    const breakdown = this.categoryBreakdown();

    // Modern, accessible color palette - matching all-time overview
    const colors = [
      '#3b82f6', // Blue
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Violet
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#f97316', // Orange
      '#ec4899', // Pink
      '#6366f1', // Indigo
    ];

    return {
      labels: breakdown.map((c) => c.category),
      datasets: [
        {
          data: breakdown.map((c) => c.amount),
          backgroundColor: colors.slice(0, breakdown.length),
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: '#ffffff',
        },
      ],
    };
  });

  // Enhanced daily spending pattern chart
  readonly dailySpendingPattern = computed(() => {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const daysInMonth = new Date(
      this.selectedYear(),
      this.selectedMonth() + 1,
      0
    ).getDate();

    const dailySpending = new Map<number, number>();

    // Initialize all days with 0
    for (let day = 1; day <= daysInMonth; day++) {
      dailySpending.set(day, 0);
    }

    transactions.forEach((t) => {
      const day = getDateDay(t.date);
      dailySpending.set(day, (dailySpending.get(day) || 0) + t.amount);
    });

    const labels = Array.from({ length: daysInMonth }, (_, i) =>
      (i + 1).toString()
    );

    return {
      labels,
      datasets: [
        {
          label: 'Daily Spending',
          data: labels.map((day) => dailySpending.get(parseInt(day)) || 0),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    };
  });

  // Income vs Expenses comparison chart
  readonly incomeVsExpensesChart = computed(() => {
    const stats = this.monthlyStats();

    return {
      labels: ['Income', 'Expenses'],
      datasets: [
        {
          data: [stats.totalIncome, stats.totalExpenses],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: '#ffffff',
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
      years.add(getDateYear(t.date));
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatCurrencyDetailed(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  formatDate(date: string): string {
    return formatAbsoluteDate(date, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatDateShort(date: string): string {
    return formatAbsoluteDate(date, {
      month: 'short',
      day: 'numeric',
    });
  }

  formatPercentage(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
  }

  getSelectedMonthName(): string {
    return this.availableMonths[this.selectedMonth()].label;
  }

  // Enhanced analytics methods
  getSavingsRate(): number {
    const stats = this.monthlyStats();
    if (stats.totalIncome === 0) return 0;
    return (
      ((stats.totalIncome - stats.totalExpenses) / stats.totalIncome) * 100
    );
  }

  getMostExpensiveTransaction(): {
    description: string;
    amount: number;
    date: string;
  } | null {
    const expenses = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    if (expenses.length === 0) return null;

    const mostExpensive = expenses.reduce((max, t) =>
      t.amount > max.amount ? t : max
    );
    return {
      description: mostExpensive.description,
      amount: mostExpensive.amount,
      date: mostExpensive.date,
    };
  }

  getBiggestIncomeTransaction(): {
    description: string;
    amount: number;
    date: string;
  } | null {
    const incomes = this.filteredTransactions().filter(
      (t) => t.type === 'INCOME'
    );
    if (incomes.length === 0) return null;

    const biggest = incomes.reduce((max, t) =>
      t.amount > max.amount ? t : max
    );
    return {
      description: biggest.description,
      amount: biggest.amount,
      date: biggest.date,
    };
  }

  getDailyAverageSpending(): number {
    const stats = this.monthlyStats();
    const daysInMonth = new Date(
      this.selectedYear(),
      this.selectedMonth() + 1,
      0
    ).getDate();
    return stats.totalExpenses / daysInMonth;
  }

  getWeeklyAverageSpending(): number {
    const stats = this.monthlyStats();
    const daysInMonth = new Date(
      this.selectedYear(),
      this.selectedMonth() + 1,
      0
    ).getDate();
    const weeksInMonth = Math.ceil(daysInMonth / 7);
    return stats.totalExpenses / weeksInMonth;
  }

  getBudgetProgress(): number {
    // For now, assume a budget of $2000/month - this could be made configurable
    const monthlyBudget = 2000;
    const stats = this.monthlyStats();
    return (stats.totalExpenses / monthlyBudget) * 100;
  }

  getBudgetStatus(): 'under' | 'over' | 'on-track' {
    const progress = this.getBudgetProgress();
    if (progress < 90) return 'under';
    if (progress > 110) return 'over';
    return 'on-track';
  }

  getHighestSpendingDay(): { day: number; amount: number } | null {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    if (transactions.length === 0) return null;

    const dailySpending = new Map<number, number>();

    transactions.forEach((t) => {
      const day = getDateDay(t.date);
      dailySpending.set(day, (dailySpending.get(day) || 0) + t.amount);
    });

    const highest = [...dailySpending.entries()].reduce((max, current) =>
      current[1] > max[1] ? current : max
    );

    return { day: highest[0], amount: highest[1] };
  }

  getSpendingVelocity(): 'high' | 'medium' | 'low' {
    const dailyAvg = this.getDailyAverageSpending();
    if (dailyAvg > 100) return 'high';
    if (dailyAvg > 50) return 'medium';
    return 'low';
  }

  getCategoryDiversity(): number {
    const breakdown = this.categoryBreakdown();
    return breakdown.length;
  }

  // Helper computed properties for template
  readonly hasTransactions = computed(() => {
    return this.filteredTransactions().length > 0;
  });

  readonly hasExpenseTransactions = computed(() =>
    this.filteredTransactions().some((t) => t.type === 'EXPENSE')
  );

  readonly hasIncomeTransactions = computed(() =>
    this.filteredTransactions().some((t) => t.type === 'INCOME')
  );

  navigateToTransactions() {
    this.router.navigate(['/dashboard/transactions']);
  }

  navigateToOverview() {
    this.router.navigate(['/dashboard/all-time']);
  }

  navigateToCategories() {
    this.router.navigate(['/dashboard/categories']);
  }

  navigateToTags() {
    this.router.navigate(['/dashboard/tags']);
  }

  getSpendingTrend(): string {
    const breakdown = this.categoryBreakdown();
    if (breakdown.length === 0) return 'No spending data';

    const totalSpending = breakdown.reduce((sum, cat) => sum + cat.amount, 0);
    const daysInMonth = new Date(
      this.selectedYear(),
      this.selectedMonth() + 1,
      0
    ).getDate();
    const avgDaily = totalSpending / daysInMonth;

    return `${this.formatCurrency(avgDaily)} avg/day`;
  }

  getTopSpendingDays(): { day: string; amount: number; date: string }[] {
    const transactions = this.filteredTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const dailySpending = new Map<string, { amount: number; date: string }>();

    transactions.forEach((t) => {
      const day = getDateDay(t.date).toString().padStart(2, '0'); // Keep as string for display
      const date = t.date; // Use original date string
      const current = dailySpending.get(day) || { amount: 0, date };
      dailySpending.set(day, {
        amount: current.amount + t.amount,
        date,
      });
    });

    return Array.from(dailySpending.entries())
      .map(([day, data]) => ({ day, amount: data.amount, date: data.date }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }
}
