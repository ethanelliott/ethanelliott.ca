import { Component, signal, computed } from '@angular/core';

interface AppLink {
  name: string;
  url: string;
  description: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-home',
  template: `
    <div class="dashboard-container">
      <!-- Header Section -->
      <header class="header-section">
        <div class="header-content">
          <div class="logo-section">
            <div class="logo">
              <span class="logo-text">🏠</span>
            </div>
            <div class="title-section">
              <h1 class="main-title">Elliott Haus</h1>
              <p class="subtitle">Internal Services Dashboard</p>
            </div>
          </div>
        </div>
      </header>

      <!-- Services Grid -->
      <section class="services-section">
        <h2 class="section-title">
          Available Services ({{ totalServices() }})
        </h2>
        <div class="services-grid">
          @for (app of filteredApps(); track app.name) {
          <div class="service-card" [style.--card-color]="app.color">
            <div class="service-header">
              <div class="service-icon">{{ app.icon }}</div>
            </div>

            <div class="service-content">
              <h3 class="service-name">{{ app.name }}</h3>
              <p class="service-description">{{ app.description }}</p>
            </div>

            <div class="service-actions">
              <button class="launch-btn" (click)="openService(app.url)">
                <span class="btn-icon">🚀</span>
                Launch
              </button>
            </div>
          </div>
          } @empty {
          <div class="empty-state">
            <p>No services available at the moment.</p>
          </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #ffffff;
    }

    .dashboard-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header Styles */
    .header-section {
      margin-bottom: 3rem;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .logo {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
    }

    .logo-text {
      font-size: 2rem;
    }

    .main-title {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0.5rem 0 0 0;
    }

    /* Services Section */
    .services-section {
      flex: 1;
      margin-bottom: 3rem;
    }

    .section-title {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 2rem;
      color: #fff;
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .service-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .service-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--card-color);
    }

    .service-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 50px rgba(0, 0, 0, 0.3);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .service-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .service-icon {
      font-size: 2rem;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }

    .service-content {
      margin-bottom: 1.5rem;
    }

    .service-name {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #fff;
    }

    .service-description {
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
      margin-bottom: 1rem;
    }

    .service-actions {
      display: flex;
      gap: 1rem;
    }

    .launch-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s ease;
      flex: 1;
      justify-content: center;
    }

    .launch-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }

    .launch-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-icon {
      font-size: 1rem;
    }

    /* Empty State */
    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem 1rem;
      color: rgba(255, 255, 255, 0.6);
      font-size: 1.1rem;
    }

    .empty-state p {
      margin: 0;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .dashboard-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
        gap: 2rem;
        text-align: center;
      }

      .main-title {
        font-size: 2rem;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .services-grid {
        grid-template-columns: 1fr;
      }

      .footer-content {
        flex-direction: column;
        gap: 1rem;
        text-align: center;
      }
    }

    @media (max-width: 480px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }

      .category-filters {
        justify-content: center;
      }
    }
  `,
})
export class HomeComponent {
  // Using signals for reactive state management
  private readonly appLinks = signal<AppLink[]>([
    {
      name: 'Finances',
      url: 'https://finances.elliott.haus',
      description:
        'Personal finance tracking and budgeting application with advanced analytics and insights.',
      icon: '💰',
      color: '#4caf50',
    },
    {
      name: 'ArgoCD',
      url: 'https://argocd.elliott.haus',
      description:
        'GitOps continuous deployment tool for Kubernetes applications.',
      icon: '🚀',
      color: '#ff5722',
    },
    // Commented out services for future expansion
    // {
    //   name: 'Grafana',
    //   url: 'https://grafana.elliott.haus',
    //   description:
    //     'Monitoring and observability platform with beautiful dashboards.',
    //   icon: '📊',
    //   color: '#ff9800',
    // },
    // {
    //   name: 'Prometheus',
    //   url: 'https://prometheus.elliott.haus',
    //   description:
    //     'Metrics collection and alerting toolkit for monitoring infrastructure.',
    //   icon: '🔥',
    //   color: '#e91e63',
    // },
    // {
    //   name: 'Loki',
    //   url: 'https://loki.elliott.haus',
    //   description:
    //     'Log aggregation system designed to store and query logs efficiently.',
    //   icon: '📝',
    //   color: '#9c27b0',
    // },
    // {
    //   name: 'Kubernetes Dashboard',
    //   url: 'https://k8s-dashboard.elliott.haus',
    //   description:
    //     'Web-based Kubernetes user interface for cluster management.',
    //   icon: '☸️',
    //   color: '#326ce5',
    // },
    // {
    //   name: 'Portainer',
    //   url: 'https://portainer.elliott.haus',
    //   description:
    //     'Container management platform for Docker and Kubernetes environments.',
    //   icon: '🐳',
    //   color: '#13bef9',
    // },
    // {
    //   name: 'Home Assistant',
    //   url: 'https://homeassistant.elliott.haus',
    //   description:
    //     'Open-source home automation platform for smart home control.',
    //   icon: '🏡',
    //   color: '#41bdf5',
    // },
    // {
    //   name: 'Plex Media Server',
    //   url: 'https://plex.elliott.haus',
    //   description: 'Media server for streaming movies, TV shows, and music.',
    //   icon: '🎬',
    //   color: '#e5a00d',
    // },
    // {
    //   name: 'Jellyfin',
    //   url: 'https://jellyfin.elliott.haus',
    //   description:
    //     'Free and open-source media server software for streaming content.',
    //   icon: '🎭',
    //   color: '#00a4dc',
    // },
    // {
    //   name: 'Pi-hole',
    //   url: 'https://pihole.elliott.haus',
    //   description:
    //     'Network-wide ad blocker acting as DNS sinkhole for advertisements.',
    //   icon: '🛡️',
    //   color: '#96060c',
    // },
    // {
    //   name: 'Nextcloud',
    //   url: 'https://nextcloud.elliott.haus',
    //   description: 'Self-hosted cloud storage and collaboration platform.',
    //   icon: '☁️',
    //   color: '#0082c9',
    // },
    // {
    //   name: 'GitLab',
    //   url: 'https://gitlab.elliott.haus',
    //   description:
    //     'Self-hosted Git repository manager with CI/CD capabilities.',
    //   icon: '🦊',
    //   color: '#fc6d26',
    // },
    // {
    //   name: 'Vault',
    //   url: 'https://vault.elliott.haus',
    //   description:
    //     'Secrets management tool for secure storage and access control.',
    //   icon: '🔐',
    //   color: '#ffec6e',
    // },
  ]);

  // Computed signals for derived state
  readonly filteredApps = computed(() => this.appLinks());
  readonly totalServices = computed(() => this.appLinks().length);

  // Methods using modern arrow function syntax
  readonly openService = (url: string): void => {
    window.open(url, '_blank');
  };

  // Method to add new services dynamically (using signals)
  readonly addService = (service: AppLink): void => {
    this.appLinks.update((services) => [...services, service]);
  };

  // Method to remove a service (using signals)
  readonly removeService = (serviceName: string): void => {
    this.appLinks.update((services) =>
      services.filter((service) => service.name !== serviceName)
    );
  };
}
