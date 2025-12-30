import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UrlStateService {
  items = signal<string[]>([]);

  constructor() {
    this.loadFromUrl();
  }

  private loadFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get('items');

    if (itemsParam) {
      try {
        const decoded = atob(itemsParam);
        const items = decoded.split('\n').filter((item) => item.trim() !== '');
        this.items.set(items);
      } catch (e) {
        console.error('Failed to decode items from URL', e);
      }
    }
  }

  updateItems(items: string[]): void {
    this.items.set(items);
    this.syncToUrl();
  }

  private syncToUrl(): void {
    const items = this.items();
    const url = new URL(window.location.href);

    if (items.length > 0) {
      const encoded = btoa(items.join('\n'));
      url.searchParams.set('items', encoded);
    } else {
      url.searchParams.delete('items');
    }

    window.history.replaceState({}, '', url.toString());
  }
}
