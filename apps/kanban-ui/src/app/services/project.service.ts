import { Injectable, inject, signal, effect } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Holds the active project selection and keeps it in sync with the
 * `?project=` URL query parameter.  All pages inject this service to
 * know which project is currently selected.
 */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly router = inject(Router);

  /** The currently selected project name (undefined = "all projects") */
  readonly selectedProject = signal<string | undefined>(undefined);

  constructor() {
    // On every navigation, read the ?project= query param and keep
    // selectedProject in sync with what's in the URL.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const params = new URLSearchParams(
          this.router.url.includes('?') ? this.router.url.split('?')[1] : ''
        );
        const project = params.get('project') ?? undefined;
        if (this.selectedProject() !== project) {
          this.selectedProject.set(project);
        }
      });

    // When selectedProject changes programmatically (e.g. from sidebar
    // dropdown), push it into the URL without adding a new history entry.
    effect(() => {
      const project = this.selectedProject();
      const url = new URL(window.location.href);
      if (project) {
        url.searchParams.set('project', project);
      } else {
        url.searchParams.delete('project');
      }
      // Replace state so the browser back button isn't polluted with every
      // project switch.
      const newRelative = url.pathname + (url.search || '');
      if (newRelative !== this.router.url) {
        this.router.navigate([], {
          queryParams: project ? { project } : {},
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  /** Convenience method to switch project. */
  selectProject(project: string | undefined): void {
    this.selectedProject.set(project);
  }
}
