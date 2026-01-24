import { computed, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import { FinanceApiService, User } from '../services/finance-api.service';

// State interface
interface UserState {
  // Loading states
  loading: boolean;
  updating: boolean;
  deleting: boolean;

  // User data
  user: User | null;
  originalName: string;

  // Error state
  error: string | null;
}

// Initial state
const initialState: UserState = {
  loading: false,
  updating: false,
  deleting: false,
  user: null,
  originalName: '',
  error: null,
};

export const UserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    // Check if there are unsaved changes
    hasChanges: computed(() => {
      const user = store.user();
      const originalName = store.originalName();
      return user?.name !== originalName;
    }),

    // User display information
    displayName: computed(() => store.user()?.name || ''),
    username: computed(() => store.user()?.username || ''),
    isActive: computed(() => store.user()?.isActive || false),
    memberSince: computed(() => store.user()?.timestamp || null),
    lastLoginAt: computed(() => store.user()?.lastLoginAt || null),

    // Error state
    error: computed(() => store.error()),
  })),
  withMethods(
    (
      store,
      apiService = inject(FinanceApiService),
      snackBar = inject(MatSnackBar),
      router = inject(Router)
    ) => ({
      // Load user profile
      loadProfile: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { loading: true, error: null })),
          switchMap(() =>
            apiService.getProfile().pipe(
              tap((user) => {
                patchState(store, {
                  user: user.user,
                  originalName: user.user.name,
                  loading: false,
                });
              }),
              catchError((error) => {
                console.error('Error loading profile:', error);
                patchState(store, {
                  loading: false,
                  error: 'Failed to load profile',
                });
                snackBar.open('Error loading profile', 'Close', {
                  duration: 3000,
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      // Update user profile
      updateProfile: rxMethod<{ name: string }>(
        pipe(
          tap(() => patchState(store, { updating: true, error: null })),
          switchMap((updates) =>
            apiService.updateProfile(updates).pipe(
              tap((updatedUser) => {
                patchState(store, {
                  user: updatedUser,
                  originalName: updatedUser.name,
                  updating: false,
                });
                snackBar.open('Profile updated successfully', 'Close', {
                  duration: 3000,
                });
              }),
              catchError((error) => {
                console.error('Error updating profile:', error);
                patchState(store, {
                  updating: false,
                  error: 'Failed to update profile',
                });
                snackBar.open('Error updating profile', 'Close', {
                  duration: 3000,
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      // Delete user account
      deleteAccount: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { deleting: true, error: null })),
          switchMap(() =>
            apiService.deleteUserAccount().pipe(
              tap(() => {
                patchState(store, {
                  deleting: false,
                  user: null,
                  originalName: '',
                });
                snackBar.open('Account deleted successfully', 'Close', {
                  duration: 5000,
                });
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                router.navigate(['/']);
              }),
              catchError((error) => {
                console.error('Error deleting account:', error);
                patchState(store, {
                  deleting: false,
                  error: 'Failed to delete account',
                });
                snackBar.open('Error deleting account', 'Close', {
                  duration: 3000,
                });
                return EMPTY;
              })
            )
          )
        )
      ),

      // Logout user
      logout: rxMethod<string | undefined>(
        pipe(
          switchMap((refreshToken) =>
            apiService.logout(refreshToken).pipe(
              tap(() => {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                patchState(store, {
                  user: null,
                  originalName: '',
                });
                router.navigate(['/']);
              }),
              catchError((error) => {
                console.error('Logout error:', error);
                // Clear tokens anyway
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                patchState(store, {
                  user: null,
                  originalName: '',
                });
                router.navigate(['/']);
                return EMPTY;
              })
            )
          )
        )
      ),

      // Clear error state
      clearError: () => {
        patchState(store, { error: null });
      },
    })
  )
);

export type UserStoreType = InstanceType<typeof UserStore>;
