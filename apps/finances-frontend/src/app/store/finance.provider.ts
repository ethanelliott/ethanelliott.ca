import { inject, InjectionToken } from '@angular/core';
import { FinanceStore, FinanceStoreType } from './finance.store';

// Create an injection token for the store
export const FINANCE_STORE = new InjectionToken<FinanceStoreType>(
  'FinanceStore',
  {
    providedIn: 'root',
    factory: () => inject(FinanceStore),
  }
);

// Helper function to inject the store
export function injectFinanceStore(): FinanceStoreType {
  return inject(FINANCE_STORE);
}
