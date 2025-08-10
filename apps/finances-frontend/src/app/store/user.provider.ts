import { inject, InjectionToken } from '@angular/core';
import { UserStore, UserStoreType } from './user.store';

// Create an injection token for the store
export const USER_STORE = new InjectionToken<UserStoreType>('UserStore', {
  providedIn: 'root',
  factory: () => inject(UserStore),
});

// Helper function to inject the store
export function injectUserStore(): UserStoreType {
  return inject(USER_STORE);
}
