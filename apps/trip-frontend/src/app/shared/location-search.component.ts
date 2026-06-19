import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import {
  GeocodeResult,
  GeocodingService,
} from '../core/geocoding.service';
import { LatLng } from '../core/models';

/**
 * Reusable place search backed by Nominatim. Emits a {lat,lng,label} when a
 * result is picked and `cleared` when emptied.
 */
@Component({
  selector: 'app-location-search',
  standalone: true,
  imports: [FormsModule, AutoComplete],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-autocomplete
      [(ngModel)]="model"
      [suggestions]="suggestions()"
      (completeMethod)="onSearch($event)"
      (onSelect)="onSelect($event.value)"
      (onClear)="cleared.emit()"
      [delay]="450"
      [minLength]="3"
      [showClear]="true"
      [forceSelection]="false"
      optionLabel="label"
      dataKey="label"
      placeholder="Search a place…"
      styleClass="w-full"
      appendTo="body"
    />
  `,
})
export class LocationSearchComponent {
  private readonly geocoding = inject(GeocodingService);

  /** Pre-fill with the existing location label, if any. */
  @Input() set locationLabel(label: string | null | undefined) {
    this.model = label ?? '';
  }

  @Output() picked = new EventEmitter<LatLng>();
  @Output() cleared = new EventEmitter<void>();

  model: string | GeocodeResult = '';
  readonly suggestions = signal<GeocodeResult[]>([]);

  async onSearch(event: AutoCompleteCompleteEvent): Promise<void> {
    try {
      this.suggestions.set(await this.geocoding.search(event.query));
    } catch {
      this.suggestions.set([]);
    }
  }

  onSelect(result: GeocodeResult): void {
    this.picked.emit({ lat: result.lat, lng: result.lng, label: result.label });
  }
}
