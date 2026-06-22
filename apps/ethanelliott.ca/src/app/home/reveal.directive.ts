import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  inject,
} from '@angular/core';

/**
 * Adds an `is-revealed` class the first time the host element scrolls into
 * view. Pair it with CSS that animates from a hidden state. Falls back to
 * immediately visible when IntersectionObserver is unavailable or the user
 * prefers reduced motion.
 */
@Directive({
  selector: '[eeReveal]',
  host: { class: 'reveal' },
})
export class RevealDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;

    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-revealed');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-revealed');
            this.observer?.unobserve(el);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );

    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
