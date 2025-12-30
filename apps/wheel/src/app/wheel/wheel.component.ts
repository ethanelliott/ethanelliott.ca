import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  effect,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UrlStateService } from '../shared/url-state.service';

interface WheelSegment {
  text: string;
  color: string;
  startAngle: number;
  endAngle: number;
}

@Component({
  selector: 'app-wheel',
  imports: [CommonModule, FormsModule],
  templateUrl: './wheel.component.html',
  styleUrls: ['./wheel.component.scss'],
})
export class WheelComponent implements OnInit {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  inputText = signal<string>('');
  isSpinning = signal<boolean>(false);
  selectedItem = signal<string | null>(null);
  showModal = signal<boolean>(false);

  private currentRotation = 0;
  private animationId: number | null = null;

  segments = computed<WheelSegment[]>(() => {
    const items = this.urlState.items();
    if (items.length === 0) return [];

    const colors = this.generateColors(items.length);
    const anglePerSegment = (2 * Math.PI) / items.length;

    return items.map((item, index) => ({
      text: item,
      color: colors[index],
      startAngle: index * anglePerSegment,
      endAngle: (index + 1) * anglePerSegment,
    }));
  });

  constructor(public urlState: UrlStateService) {
    // Initialize input text from URL state
    effect(() => {
      const items = this.urlState.items();
      if (items.length > 0) {
        this.inputText.set(items.join('\n'));
      }
    });

    // Redraw wheel when segments change
    effect(() => {
      const segs = this.segments();
      if (segs.length > 0) {
        setTimeout(() => this.drawWheel(), 0);
      }
    });
  }

  ngOnInit(): void {
    setTimeout(() => {
      if (this.segments().length > 0) {
        this.drawWheel();
      }
    }, 100);
  }

  onInputChange(): void {
    const text = this.inputText();
    const items = text
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    this.urlState.updateItems(items);
  }

  spinWheel(): void {
    if (this.isSpinning() || this.segments().length === 0) return;

    this.isSpinning.set(true);

    // Random spin parameters
    const minSpins = 5;
    const maxSpins = 8;
    const spins = minSpins + Math.random() * (maxSpins - minSpins);
    const extraRotation = Math.random() * 2 * Math.PI;
    const totalRotation = spins * 2 * Math.PI + extraRotation;

    const duration = 4000; // 4 seconds
    const startTime = performance.now();
    const startRotation = this.currentRotation;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      this.currentRotation = startRotation + totalRotation * eased;

      this.drawWheel();

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.isSpinning.set(false);
        this.determineWinner();
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  private determineWinner(): void {
    const segments = this.segments();
    if (segments.length === 0) return;

    // Normalize rotation to 0-2π
    const normalizedRotation = this.currentRotation % (2 * Math.PI);
    
    // The pointer is at the top (90 degrees in our coordinate system)
    // We need to find which segment is under the pointer
    const pointerAngle = (Math.PI / 2 - normalizedRotation) % (2 * Math.PI);
    const adjustedAngle = pointerAngle < 0 ? pointerAngle + 2 * Math.PI : pointerAngle;

    for (const segment of segments) {
      if (adjustedAngle >= segment.startAngle && adjustedAngle < segment.endAngle) {
        this.selectedItem.set(segment.text);
        this.showModal.set(true);
        break;
      }
    }
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  removeSelectedItem(): void {
    const selected = this.selectedItem();
    if (!selected) return;

    const currentItems = this.urlState.items();
    const newItems = currentItems.filter((item) => item !== selected);
    this.urlState.updateItems(newItems);
    this.inputText.set(newItems.join('\n'));
    
    this.showModal.set(false);
    this.selectedItem.set(null);
  }

  keepSelectedItem(): void {
    this.closeModal();
  }

  private drawWheel(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const segments = this.segments();
    if (segments.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.currentRotation);

    // Draw segments
    segments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, segment.startAngle, segment.endAngle);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text
      ctx.save();
      const angle = (segment.startAngle + segment.endAngle) / 2;
      ctx.rotate(angle);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(segment.text, radius * 0.65, 0);
      ctx.restore();
    });

    ctx.restore();

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw pointer at top
    ctx.beginPath();
    ctx.moveTo(centerX, 10);
    ctx.lineTo(centerX - 15, 40);
    ctx.lineTo(centerX + 15, 40);
    ctx.closePath();
    ctx.fillStyle = '#ff4444';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private generateColors(count: number): string[] {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 360) / count;
      colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
  }
}
