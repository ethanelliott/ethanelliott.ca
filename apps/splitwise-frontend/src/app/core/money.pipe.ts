import { Pipe, PipeTransform } from '@angular/core';

/** Format integer cents into a localized currency string. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined, currency = 'USD'): string {
    const value = (cents ?? 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  }
}
