import {
  Component,
  signal,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import 'iconify-icon';

interface AppLink {
  name: string;
  url: string;
  description: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-home',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="page">
      <!-- Header -->
      <header class="header">
        <h1>elliott.haus</h1>
      </header>

      <!-- Services Bento Grid -->
      <section class="services">
        <div class="bento">
          @for (app of services(); track app.name; let i = $index) {
          <a
            [href]="app.url"
            target="_blank"
            rel="noopener noreferrer"
            class="bento-item"
            [style.--accent]="app.color"
            [style.--i]="i"
          >
            <div class="bento-glow"></div>
            <div class="bento-content">
              <span class="bento-icon"
                ><iconify-icon
                  [icon]="app.icon"
                  [style.color]="app.color"
                ></iconify-icon
              ></span>
              <div class="bento-text">
                <h3>{{ app.name }}</h3>
                <p>{{ app.description }}</p>
              </div>
            </div>
            <div class="bento-footer">
              <span class="bento-link">
                Open
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </a>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: #09090b;
      color: #fafafa;
      position: relative;
      overflow: hidden;
    }

    :host::before {
      content: '';
      position: fixed;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: 
        radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 40% 80%, rgba(34, 197, 94, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 80% 20%, rgba(249, 115, 22, 0.08) 0%, transparent 40%);
      animation: gradientMove 20s ease-in-out infinite;
      pointer-events: none;
      z-index: 0;
    }

    @keyframes gradientMove {
      0%, 100% {
        transform: translate(0, 0) rotate(0deg);
      }
      25% {
        transform: translate(2%, 2%) rotate(1deg);
      }
      50% {
        transform: translate(-1%, 3%) rotate(-1deg);
      }
      75% {
        transform: translate(-2%, -1%) rotate(0.5deg);
      }
    }

    .page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 1;
    }

    /* Header */
    .header {
      padding: 2rem 1.5rem 1.5rem;
      text-align: center;
    }

    .header h1 {
      font-size: clamp(1.5rem, 4vw, 2rem);
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.02em;
      color: #fafafa;
    }

    /* Services Section */
    .services {
      flex: 1;
      padding: 0.5rem 1.5rem 3rem;
      max-width: 1000px;
      margin: 0 auto;
      width: 100%;
    }

    /* Bento Grid */
    .bento {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .bento-item {
      position: relative;
      background: linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 1.25rem;
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: slideUp 0.5s ease-out backwards;
      animation-delay: calc(var(--i) * 40ms);
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
    }

    .bento-item.featured {
      grid-column: span 2;
      padding: 2rem;
    }

    .bento-item:hover {
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-2px);
      background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
    }

    .bento-glow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .bento-item:hover .bento-glow {
      opacity: 0.6;
    }

    .bento-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bento-icon {
      font-size: 2.5rem;
      line-height: 1;
    }

    .bento-icon iconify-icon {
      display: block;
    }

    .featured .bento-icon {
      font-size: 3rem;
    }

    .bento-text h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 0.4rem;
      color: #fafafa;
      letter-spacing: -0.01em;
    }

    .featured .bento-text h3 {
      font-size: 1.3rem;
    }

    .bento-text p {
      font-size: 0.85rem;
      color: #71717a;
      margin: 0;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .featured .bento-text p {
      -webkit-line-clamp: 3;
    }

    .bento-footer {
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .bento-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 500;
      color: #71717a;
      transition: all 0.2s ease;
    }

    .bento-link svg {
      transition: transform 0.2s ease;
    }

    .bento-item:hover .bento-link {
      color: var(--accent);
    }

    .bento-item:hover .bento-link svg {
      transform: translateX(3px);
    }

    /* Responsive - Tablet */
    @media (max-width: 900px) {
      .bento {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* Responsive - Mobile */
    @media (max-width: 600px) {
      .header {
        padding: 1.5rem 1rem 1rem;
      }

      .services {
        padding: 0.5rem 1rem 2rem;
      }

      .bento {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }

      .bento-item {
        padding: 1.25rem;
        flex-direction: row;
        align-items: center;
        gap: 1rem;
      }

      .bento-content {
        flex-direction: row;
        align-items: center;
        gap: 1rem;
      }

      .bento-icon {
        font-size: 2rem;
      }

      .bento-text {
        flex: 1;
        min-width: 0;
      }

      .bento-text h3 {
        font-size: 1rem;
      }

      .bento-text p {
        font-size: 0.8rem;
        -webkit-line-clamp: 1;
      }

      .bento-footer {
        display: none;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .bento-item {
        animation: none;
      }

      .bento-link svg,
      .bento-item {
        transition: none;
      }
    }
  `,
})
export class HomeComponent {
  readonly currentYear = new Date().getFullYear();

  private readonly appLinks = signal<AppLink[]>([
    {
      name: 'Finances',
      url: 'https://finances.elliott.haus',
      description: 'Personal finance tracking and budgeting.',
      icon: 'mdi:cash-multiple',
      color: '#22c55e',
    },
    {
      name: 'Wheel',
      url: 'https://wheel.elliott.haus',
      description: 'Spin the wheel for random decisions.',
      icon: 'mdi:ferris-wheel',
      color: '#8b5cf6',
    },
    {
      name: 'ArgoCD',
      url: 'https://argocd.elliott.haus',
      description: 'GitOps continuous deployment.',
      icon: 'simple-icons:argo',
      color: '#f97316',
    },
    {
      name: 'Prometheus',
      url: 'https://prometheus.elliott.haus',
      description: 'Metrics collection and monitoring.',
      icon: 'simple-icons:prometheus',
      color: '#e6522c',
    },
    {
      name: 'Grafana',
      url: 'https://grafana.elliott.haus',
      description: 'Analytics and monitoring dashboards.',
      icon: 'simple-icons:grafana',
      color: '#f46800',
    },
    {
      name: 'Home Assistant',
      url: 'https://home.elliott.haus',
      description: 'Smart home automation and control.',
      icon: 'simple-icons:homeassistant',
      color: '#18bcf2',
    },
  ]);

  readonly services = computed(() => this.appLinks());
}
