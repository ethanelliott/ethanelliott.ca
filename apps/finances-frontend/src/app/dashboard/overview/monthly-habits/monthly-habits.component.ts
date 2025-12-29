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
import {
  FinanceApiService,
  Transaction,
  MonthlyHabitsOverview,
} from '../../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';
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
  transferCount: number;
  totalTransferVolume: number;
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
  private readonly apiService = inject(FinanceApiService);
  private readonly router = inject(Router);

  // Current selected month/year
  readonly selectedMonth = signal(new Date().getMonth());
  readonly selectedYear = signal(new Date().getFullYear());

  // Monthly habits overview data
  readonly monthlyOverview = signal<MonthlyHabitsOverview | null>(null);
  readonly loading = signal(true);

  ngOnInit() {
    this.loadMonthlyData();
  }

  private async loadMonthlyData() {
    try {
      this.loading.set(true);
      const overview = await firstValueFrom(
        this.apiService.getMonthlyHabitsOverview(
          this.selectedYear(),
          this.selectedMonth()
        )
      );
      this.monthlyOverview.set(overview);
    } catch (error) {
      console.error('Error loading monthly habits overview:', error);
      this.monthlyOverview.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async onMonthYearChange() {
    await this.loadMonthlyData();
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
            return `${label}: ${this.formatCurrency(value || 0)}`;
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
    // This is kept for backward compatibility with existing chart methods
    // TODO: Refactor these to use the monthly overview data directly
    return [];
  });

  readonly monthlyStats = computed(() => {
    const overview = this.monthlyOverview();
    if (!overview) {
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netAmount: 0,
        transactionCount: 0,
        transferCount: 0,
        totalTransferVolume: 0,
        topCategory: '',
        avgTransactionAmount: 0,
        mostActiveDay: '',
      };
    }

    // Find top category from the category breakdown
    const topCategory =
      overview.categoryBreakdown.length > 0
        ? overview.categoryBreakdown[0].category
        : '';

    // Find most active day from daily breakdown
    const mostActiveDay =
      overview.dailyBreakdown
        .reduce((max, current) =>
          current.income + current.expenses + current.transfers >
          max.income + max.expenses + max.transfers
            ? current
            : max
        )
        ?.day?.toString() || '';

    return {
      totalIncome: overview.totalIncome,
      totalExpenses: overview.totalExpenses,
      netAmount: overview.netCashFlow,
      transactionCount: overview.transactionCount,
      transferCount: overview.transferCount,
      totalTransferVolume: overview.totalTransferVolume,
      topCategory,
      avgTransactionAmount: overview.averageTransactionSize,
      mostActiveDay,
    };
  });

  readonly categoryBreakdown = computed(() => {
    const overview = this.monthlyOverview();
    if (!overview) return [];

    return overview.categoryBreakdown
      .map((cat) => ({ category: cat.category, amount: cat.amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  readonly weeklySpendingPattern = computed(() => {
    const overview = this.monthlyOverview();
    if (!overview) {
      return {
        labels: [],
        datasets: [
          {
            label: 'Weekly Spending',
            data: [],
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: '#ef4444',
            borderWidth: 2,
            fill: true,
          },
        ],
      };
    }

    const labels = overview.weeklyBreakdown.map((w) => `Week ${w.week}`);
    const data = overview.weeklyBreakdown.map((w) => w.expenses);

    return {
      labels,
      datasets: [
        {
          label: 'Weekly Spending',
          data,
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
    const overview = this.monthlyOverview();
    if (!overview) {
      return {
        labels: [],
        datasets: [
          {
            label: 'Daily Spending',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
          },
        ],
      };
    }

    const labels = overview.dailyBreakdown.map((d) => d.day.toString());
    const spendingData = overview.dailyBreakdown.map((d) => d.expenses);

    return {
      labels,
      datasets: [
        {
          label: 'Daily Spending',
          data: spendingData,
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

  // Get transactions for chart that shows transaction metadata
  private getTransactionsFromOverview(): Transaction[] {
    const overview = this.monthlyOverview();
    if (!overview) return [];

    // For now, return empty array since charts need to be refactored to use overview data
    // TODO: Refactor charts to use daily/weekly breakdown from overview
    return [];
  }

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
    // For now, return last 3 years including current year
    // TODO: Could get this from the API or overview data
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear - 1, currentYear - 2];
  });

  // Methods
  onMonthChange(month: number) {
    this.selectedMonth.set(month);
    this.loadMonthlyData();
  }

  onYearChange(year: number) {
    this.selectedYear.set(year);
    this.loadMonthlyData();
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

  formatPercentage(value: number, decimals = 1): string {
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
    // TODO: Could get this from the monthly overview if we enhance the API
    return null;
  }

  getBiggestIncomeTransaction(): {
    description: string;
    amount: number;
    date: string;
  } | null {
    // TODO: Could get this from the monthly overview if we enhance the API
    return null;
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
    // TODO: Could enhance the API to provide daily spending breakdowns
    return null;
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
    const overview = this.monthlyOverview();
    return overview ? overview.transactionCount > 0 : false;
  });

  readonly hasExpenseTransactions = computed(() => {
    const overview = this.monthlyOverview();
    return overview ? overview.totalExpenses > 0 : false;
  });

  readonly hasIncomeTransactions = computed(() => {
    const overview = this.monthlyOverview();
    return overview ? overview.totalIncome > 0 : false;
  });

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
    // TODO: Could enhance the API to provide daily spending breakdowns
    return [];
  }
}
