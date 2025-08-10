import { Component } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

export interface TagsCellRendererParams extends ICellRendererParams {
  value: string[];
}

@Component({
  selector: 'app-tags-cell-renderer',
  standalone: true,
  imports: [MatChipsModule],
  template: `
    @if (tags && tags.length > 0) {
    <div class="tags-container">
      <mat-chip-set>
        @for (tag of tags; track tag) {
        <mat-chip class="tag-chip">
          {{ tag }}
        </mat-chip>
        }
      </mat-chip-set>
    </div>
    }
  `,
  styles: `
    .tags-container {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 4px 0;
    }

    .tag-chip {
      font-size: 0.75rem;
      font-weight: 500;
      height: 24px;
      line-height: 24px;
    }

    mat-chip-set {
      --mdc-chip-container-height: 24px;
      --mdc-chip-label-text-size: 0.75rem;
      --mdc-chip-label-text-weight: 500;
    }
  `,
})
export class TagsCellRendererComponent implements ICellRendererAngularComp {
  tags: string[] = [];

  agInit(params: TagsCellRendererParams): void {
    this.tags = params.value || [];
  }

  refresh(params: TagsCellRendererParams): boolean {
    this.tags = params.value || [];
    return true;
  }
}
