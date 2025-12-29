import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { injectFinanceStore } from '../../store/finance.provider';
import {
  createAbsoluteDate,
  compareDates,
  formatAbsoluteDate,
  getWeekdayName,
} from '../../utils/date-utils';

// Register Chart.js components
Chart.register(...registerables);

interface AllTimeStats {
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
  transactionCount: number;
  topExpenseCategory: string;
  averageTransactionAmount: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  firstTransactionDate: string | null;
  totalTimespan: string;
}

@Component({
  selector: 'app-all-time-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './all-time-overview.component.html',
  styleUrl: './all-time-overview.component.scss',
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
export class AllTimeOverviewComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly router = inject(Router);

  ngOnInit() {
    // Load all data when component initializes
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    } else {
      // If basic data is loaded, ensure overview data is fresh
      this.financeStore.loadOverviewData();
    }
  }

  // Enhanced chart options with modern styling
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

  // Computed values based on the store
  readonly allTimeStats = computed(() => {
    const transactions = this.financeStore.transactions();
    const income = this.financeStore.totalIncome();
    const expenses = this.financeStore.totalExpenses();
    const monthlyTrends = this.financeStore.monthlyTrends();

    // Find most common category for expenses
    const categoryCount = new Map<string, number>();
    const categoryAmounts = new Map<string, number>();

    transactions.forEach((t) => {
      if (t.type === 'EXPENSE') {
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
        categoryAmounts.set(
          t.category,
          (categoryAmounts.get(t.category) || 0) + t.amount
        );
      }
    });

    // Get data from comprehensive backend overview
    const overview = this.financeStore.allTimeOverview();

    const topExpenseCategory =
      overview?.topExpenseCategories?.[0]?.category ??
      ([...categoryAmounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
        '');

    // Calculate averages - use backend data if available, fallback to manual calculation
    const averageTransactionAmount =
      transactions.length > 0 ? (income + expenses) / transactions.length : 0;

    const averageMonthlyIncome =
      overview?.averageMonthlyIncome ??
      (monthlyTrends.length > 0
        ? monthlyTrends.reduce((sum, m) => sum + m.income, 0) /
          monthlyTrends.length
        : 0);

    const averageMonthlyExpenses =
      overview?.averageMonthlyExpenses ??
      (monthlyTrends.length > 0
        ? monthlyTrends.reduce((sum, m) => sum + m.expenses, 0) /
          monthlyTrends.length
        : 0);

    // Find first transaction date - use backend data if available
    const sortedTransactions = transactions.sort((a, b) =>
      compareDates(a.date, b.date)
    );
    const firstTransactionDate =
      overview?.firstTransactionDate ??
      (sortedTransactions.length > 0 ? sortedTransactions[0].date : null);

    // Calculate total timespan - use backend data if available
    let totalTimespan = 'No transactions yet';
    if (overview?.daysSinceFirstTransaction) {
      const diffDays = overview.daysSinceFirstTransaction;
      if (diffDays < 30) {
        totalTimespan = `${diffDays} days`;
      } else if (diffDays < 365) {
        const months = Math.round(diffDays / 30);
        totalTimespan = `${months} month${months !== 1 ? 's' : ''}`;
      } else {
        const years = Math.round(diffDays / 365);
        totalTimespan = `${years} year${years !== 1 ? 's' : ''}`;
      }
    } else if (firstTransactionDate && transactions.length > 0) {
      const firstDate = createAbsoluteDate(firstTransactionDate);
      const lastDate = new Date();
      const diffTime = Math.abs(lastDate.getTime() - firstDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 30) {
        totalTimespan = `${diffDays} days`;
      } else if (diffDays < 365) {
        const months = Math.round(diffDays / 30);
        totalTimespan = `${months} month${months !== 1 ? 's' : ''}`;
      } else {
        const years = Math.round(diffDays / 365);
        totalTimespan = `${years} year${years !== 1 ? 's' : ''}`;
      }
    }

    return {
      totalIncome: overview?.totalIncome ?? income,
      totalExpenses: overview?.totalExpenses ?? expenses,
      netWorth: this.financeStore.currentNetWorth(),
      transactionCount:
        overview?.transactionCount ?? this.financeStore.transactionCount(),
      topExpenseCategory,
      averageTransactionAmount,
      averageMonthlyIncome,
      averageMonthlyExpenses,
      firstTransactionDate,
      totalTimespan,
    };
  });

  readonly recentTransactions = computed(() => {
    return this.financeStore.recentTransactions();
  });

  readonly loading = computed(() => this.financeStore.loading());

  // Enhanced chart data for all-time historical trends with better colors
  readonly historicalTrendsChartData = computed(() => {
    const trends = this.financeStore.monthlyTrends();

    const chartData = {
      labels: trends.map((t) => t.month),
      datasets: [
        {
          label: 'Income',
          data: trends.map((t) => t.income),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: 'origin',
          tension: 0.4,
        },
        {
          label: 'Expenses',
          data: trends.map((t) => t.expenses),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: 'origin',
          tension: 0.4,
        },
        {
          label: 'Net Worth',
          data: trends.map((t) => t.net),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: false,
          tension: 0.4,
          borderWidth: 3,
        },
      ],
    };

    return chartData;
  });

  // Enhanced all-time category breakdown with modern color palette
  readonly allTimeCategoryChartData = computed(() => {
    const transactions = this.financeStore
      .transactions()
      .filter((t) => t.type === 'EXPENSE');
    const categoryMap = new Map<string, number>();

    transactions.forEach((t) => {
      categoryMap.set(
        t.category,
        (categoryMap.get(t.category) || 0) + t.amount
      );
    });

    const breakdown = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10 categories for better visibility

    // Modern, accessible color palette
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

  // Helper computed properties for template
  readonly hasExpenseTransactions = computed(() =>
    this.financeStore.transactions().some((t) => t.type === 'EXPENSE')
  );

  readonly hasTrendData = computed(() => {
    const transactions = this.financeStore.transactions();
    const loading = this.financeStore.loading();
    const trends = this.financeStore.monthlyTrends();

    console.log('🔍 Has trend data check:');
    console.log('  - Loading:', loading);
    console.log('  - Transactions count:', transactions.length);
    console.log('  - Trends count:', trends.length);
    console.log(
      '  - Has meaningful data:',
      trends.some((t) => t.income > 0 || t.expenses > 0)
    );

    // Don't show "no data" while loading
    if (loading) {
      console.log('  - Result: true (loading)');
      return true;
    }

    // Show chart if we have any transactions at all
    const result = transactions.length > 0 && trends.length > 0;
    console.log('  - Result:', result);
    return result;
  });

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

  getHealthScoreClass(): string {
    const score = this.financeStore.healthScore();
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  getHealthScoreDescription(): string {
    const score = this.financeStore.healthScore();
    if (score >= 80) return 'Exceptional financial management!';
    if (score >= 60) return 'Strong financial foundation';
    if (score >= 40) return 'Good progress, room to grow';
    return 'Focus needed on financial health';
  }

  // Enhanced analytics methods with more insights
  getMostActiveDay(): string {
    const transactions = this.financeStore.transactions();
    if (transactions.length === 0) return 'No data available';

    const dayCount = new Map<string, number>();

    transactions.forEach((t) => {
      const day = getWeekdayName(t.date);
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    });

    const mostActive = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return mostActive
      ? `${mostActive[0]} (${mostActive[1]} transactions)`
      : 'No data';
  }

  getMostActiveMonth(): string {
    const trends = this.financeStore.monthlyTrends();
    if (trends.length === 0) return 'No data available';

    const mostActive = trends.reduce((max, month) =>
      month.transactionCount > max.transactionCount ? month : max
    );

    return `${mostActive.month} (${mostActive.transactionCount} transactions)`;
  }

  getMostExpensiveTransaction(): {
    description: string;
    amount: number;
    date: string;
  } | null {
    const expenses = this.financeStore
      .transactions()
      .filter((t) => t.type === 'EXPENSE');
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
    const incomes = this.financeStore
      .transactions()
      .filter((t) => t.type === 'INCOME');
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

  getAverageTransactionsPerMonth(): number {
    const trends = this.financeStore.monthlyTrends();
    if (trends.length === 0) return 0;

    return (
      trends.reduce((sum, month) => sum + month.transactionCount, 0) /
      trends.length
    );
  }

  getSavingsRate(): number {
    const stats = this.allTimeStats();
    if (stats.totalIncome === 0) return 0;
    return (
      ((stats.totalIncome - stats.totalExpenses) / stats.totalIncome) * 100
    );
  }

  getBestSavingsMonth(): string {
    const trends = this.financeStore.monthlyTrends();
    if (trends.length === 0) return 'No data available';

    const bestMonth = trends.reduce((max, month) =>
      month.net > max.net ? month : max
    );

    return `${bestMonth.month} (${this.formatCurrency(bestMonth.net)} saved)`;
  }

  getWorstSpendingMonth(): string {
    const trends = this.financeStore.monthlyTrends();
    if (trends.length === 0) return 'No data available';

    const worstMonth = trends.reduce((max, month) =>
      month.expenses > max.expenses ? month : max
    );

    return `${worstMonth.month} (${this.formatCurrency(
      worstMonth.expenses
    )} spent)`;
  }

  getSpendingTrend(): 'increasing' | 'decreasing' | 'stable' {
    const trends = this.financeStore.monthlyTrends();
    if (trends.length < 3) return 'stable';

    const recent = trends.slice(-3);
    const avgRecent =
      recent.reduce((sum, m) => sum + m.expenses, 0) / recent.length;
    const previous = trends.slice(-6, -3);
    const avgPrevious =
      previous.reduce((sum, m) => sum + m.expenses, 0) / previous.length;

    const change = ((avgRecent - avgPrevious) / avgPrevious) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  navigateToTransactions() {
    this.router.navigate(['/dashboard/transactions']);
  }

  navigateToCategories() {
    this.router.navigate(['/dashboard/categories']);
  }

  navigateToTags() {
    this.router.navigate(['/dashboard/tags']);
  }
}
